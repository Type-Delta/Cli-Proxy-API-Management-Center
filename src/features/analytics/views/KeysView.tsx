import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/Table';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { analyticsApi } from '@/services/api';
import type {
  AnalyticsKey,
  AnalyticsLeaderboard,
  AnalyticsRange as AnalyticsResolvedRange,
} from '@/types';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import { analyticsKeyIdentity } from '../analyticsKeyFilterModel';
import { AsyncState } from '../components/AnalyticsShared';
import { analyticsErrorCopy } from '../components/analyticsErrorCopy';
import {
  formatCompactTokens,
  formatCostValue,
  formatAccumulatedDuration,
  formatNumber,
  formatPercent,
} from '../components/analyticsFormatting';
import {
  analyticsRangeLabel,
  buildAnalyticsQuery,
  freezeAnalyticsCursorQuery,
  type AnalyticsRange,
} from '../query';
import { useAnalyticsLoad } from '../useAnalyticsLoad';
import {
  joinKeyRanking,
  keyActivityDate,
  keyStatusForDisplay,
  shouldShowPricingDisclosure,
  sortKeyRanking,
  type KeyColumnSort,
  type KeySortDirection,
} from './keys/keyRanking';
import styles from './keys/KeysView.module.scss';

type CatalogColumn = {
  id: KeyColumnSort;
  labelKey: string;
  defaultValue: string;
  descriptionKey: string;
  descriptionDefault: string;
  alignRight?: boolean;
};

function CatalogHeader({
  column,
  active,
  direction,
  onClick,
  label,
  description,
}: {
  column: CatalogColumn;
  active: boolean;
  direction: KeySortDirection;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <SortableTableHead
      alignRight={column.alignRight}
      active={active}
      ariaLabel={`${label}. ${description}`}
      description={description}
      direction={direction}
      onClick={onClick}
    >
      {label}
    </SortableTableHead>
  );
}

const SORTABLE_COLUMNS: ReadonlyArray<CatalogColumn> = [
  {
    id: 'server',
    labelKey: 'analytics.rank',
    defaultValue: 'Rank',
    descriptionKey: 'analytics.keys_header_help.rank',
    descriptionDefault: 'Server rank for this key in the selected range.',
    alignRight: true,
  },
  {
    id: 'key',
    labelKey: 'analytics.key',
    defaultValue: 'Key',
    descriptionKey: 'analytics.keys_header_help.key',
    descriptionDefault: 'The concealed key identity and optional label.',
  },
  {
    id: 'status',
    labelKey: 'common.status',
    defaultValue: 'Status',
    descriptionKey: 'analytics.keys_header_help.status',
    descriptionDefault:
      'Whether this API key is currently configured, recently used, or retained only in usage history.',
  },
  {
    id: 'tokens',
    labelKey: 'analytics.total_tokens',
    defaultValue: 'Total tokens',
    descriptionKey: 'analytics.keys_header_help.tokens',
    descriptionDefault: 'Total tokens recorded in the selected range.',
    alignRight: true,
  },
  {
    id: 'cost',
    labelKey: 'analytics.known_cost',
    defaultValue: 'Estimated API-equivalent cost',
    descriptionKey: 'analytics.keys_header_help.cost',
    descriptionDefault: 'Known API-equivalent cost for priced usage only.',
    alignRight: true,
  },
  {
    id: 'unpriced',
    labelKey: 'analytics.unpriced_tokens',
    defaultValue: 'Unpriced tokens',
    descriptionKey: 'analytics.keys_header_help.unpriced',
    descriptionDefault: 'Tokens without a matching price rule.',
    alignRight: true,
  },
  {
    id: 'share',
    labelKey: 'analytics.share',
    defaultValue: 'Share',
    descriptionKey: 'analytics.keys_header_help.share',
    descriptionDefault: 'Share of the selected leaderboard total.',
    alignRight: true,
  },
  {
    id: 'top_model',
    labelKey: 'analytics.top_model',
    defaultValue: 'Top model',
    descriptionKey: 'analytics.keys_header_help.top_model',
    descriptionDefault:
      'Model with the most tokens for this key; the smaller line is its token count.',
  },
  {
    id: 'generation_time',
    labelKey: 'analytics.generation_time',
    defaultValue: 'Generation time',
    descriptionKey: 'analytics.keys_header_help.generation_time',
    descriptionDefault: 'Accumulated observed generation time, when available.',
    alignRight: true,
  },
  {
    id: 'requests',
    labelKey: 'analytics.total_requests',
    defaultValue: 'Total requests',
    descriptionKey: 'analytics.keys_header_help.requests',
    descriptionDefault: 'Proxy requests recorded in the selected range.',
    alignRight: true,
  },
  {
    id: 'indexes',
    labelKey: 'analytics.config_indexes',
    defaultValue: 'Config indexes',
    descriptionKey: 'analytics.keys_header_help.indexes',
    descriptionDefault: 'Configuration indexes linked to this key.',
    alignRight: true,
  },
  {
    id: 'first_activity',
    labelKey: 'analytics.first_activity',
    defaultValue: 'First activity',
    descriptionKey: 'analytics.keys_header_help.first_activity',
    descriptionDefault: 'Lifetime first activity, shown in your browser timezone.',
  },
  {
    id: 'last_activity',
    labelKey: 'analytics.last_activity',
    defaultValue: 'Last activity',
    descriptionKey: 'analytics.keys_header_help.last_activity',
    descriptionDefault: 'Lifetime last activity, shown in your browser timezone.',
  },
];

function ActivityValue({ lifetimeValue }: { lifetimeValue: string | null }) {
  const { t, i18n } = useTranslation();
  const date = keyActivityDate(lifetimeValue, i18n.resolvedLanguage);
  return (
    <span className={styles.stackedValue} title={lifetimeValue ?? undefined}>
      <span className={styles.relativeDate}>
        {date?.relative ?? t('analytics.unknown_value', { defaultValue: 'Unknown' })}
      </span>
      <small>{date?.full ?? t('analytics.unknown_value', { defaultValue: 'Unknown' })}</small>
    </span>
  );
}

function KeyStatus({
  row,
}: {
  row: { status: AnalyticsKey['status']; lifetime_last_activity_at: string | null };
}) {
  const { t } = useTranslation();
  const status = keyStatusForDisplay(row.status, row.lifetime_last_activity_at);
  const descriptions = {
    active: 'Configured and used within the last five minutes.',
    idle: 'Configured and ready for use, with no activity in the last five minutes.',
    rotated: 'This key was replaced during rotation; its usage history is retained.',
    deleted: 'This key was removed from configuration; its usage history is retained.',
    historical: 'This key appears in usage history but is not currently configured.',
    identity_conflict:
      'Conflicting key identities were detected; attribution cannot be resolved reliably.',
  };
  return (
    <span
      className={`status-badge ${styles.statusBadge} ${status === 'active' ? 'success' : status === 'deleted' ? 'error' : ''}`}
      title={t(`analytics.key_status_help.${status}`, { defaultValue: descriptions[status] })}
    >
      {t(`analytics.enums.key_status.${status}`)}
    </span>
  );
}

function TopModelValue({
  row,
}: {
  row: { top_model: string | null; top_model_tokens: number | null };
}) {
  const { t, i18n } = useTranslation();
  const tokenValue =
    row.top_model_tokens === null
      ? null
      : formatCompactTokens(row.top_model_tokens, i18n.resolvedLanguage);
  return (
    <span className={styles.topModelValue} title={row.top_model ?? undefined}>
      <span>{row.top_model || t('analytics.unknown_value', { defaultValue: 'Unknown' })}</span>
      <small>
        {row.top_model && tokenValue
          ? t('analytics.model_token_count', {
              defaultValue: '{{count}} tokens',
              count: tokenValue.text,
            })
          : t('analytics.unknown_value', { defaultValue: 'Unknown' })}
      </small>
    </span>
  );
}

export function KeysView({ keys, range }: { keys: AnalyticsKey[]; range: AnalyticsRange }) {
  const { t, i18n } = useTranslation();
  const { sort, setSort, reportResolvedRange } = useAnalyticsFilters();
  const [columnSort, setColumnSort] = useState<KeyColumnSort>('server');
  const [direction, setDirection] = useState<KeySortDirection>('asc');
  const isMobile = useMediaQuery('(max-width: 768px)');
  const rankingRequest = useMemo(
    () => buildAnalyticsQuery('leaderboard', range, [], { sort_by: sort, page_size: 500 }),
    [range, sort]
  );
  const ranking = useAnalyticsLoad(async () => {
    const rows: AnalyticsLeaderboard['rows'] = [];
    const cursors = new Set<string>();
    let cursor = '';
    let frozenRange: AnalyticsResolvedRange | undefined;
    let page: AnalyticsLeaderboard;
    do {
      page = await analyticsApi.leaderboard(
        cursor && frozenRange
          ? freezeAnalyticsCursorQuery(rankingRequest, cursor, frozenRange)
          : rankingRequest
      );
      frozenRange ??= page.meta.range;
      rows.push(...page.rows);
      cursor = page.meta.next_cursor ?? '';
      if (cursor && cursors.has(cursor)) break;
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return { ...page, rows };
  }, JSON.stringify(rankingRequest));
  const rankingFailure = analyticsErrorCopy(t, ranking.error);
  const rows = useMemo(
    () => sortKeyRanking(joinKeyRanking(keys, ranking.data?.rows ?? []), columnSort, direction),
    [columnSort, direction, keys, ranking.data?.rows]
  );
  const activeColumnSort =
    columnSort === 'server' && (sort === 'tokens' || sort === 'cost') ? sort : columnSort;
  const activeDirection =
    columnSort === 'server' && (sort === 'tokens' || sort === 'cost') ? 'desc' : direction;
  useEffect(() => {
    if (ranking.data?.meta.range) reportResolvedRange(range, ranking.data.meta.range);
  }, [range, ranking.data?.meta.range, reportResolvedRange]);

  const chooseColumnSort = (next: KeyColumnSort) => {
    if (next === 'tokens' || next === 'cost') {
      setSort(next);
      setColumnSort(next);
      setDirection('desc');
      return;
    }
    if (next === 'server') {
      setColumnSort('server');
      setDirection('asc');
      return;
    }
    if (columnSort === next) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setColumnSort(next);
    setDirection(next === 'key' || next === 'status' || next === 'top_model' ? 'asc' : 'desc');
  };

  return (
    <AsyncState
      loading={ranking.loading}
      error=""
      errorStatus={ranking.errorStatus}
      retryAt={ranking.retryAt}
      stale={ranking.data?.meta.degraded}
      onRetry={() => void ranking.refresh()}
    >
      <Card
        title={t('analytics.keys_catalog')}
        extra={<span className={styles.rangeNote}>{analyticsRangeLabel(t, range)}</span>}
      >
        {ranking.error && (
          <div className="error-box" role="alert" title={rankingFailure.detail}>
            <span>{rankingFailure.text}</span>
            <Button
              className={styles.retryButton}
              variant="secondary"
              onClick={() => void ranking.refresh()}
            >
              {t('common.retry')}
            </Button>
          </div>
        )}
        {shouldShowPricingDisclosure(sort) && (
          <p className={styles.disclosure}>{t('analytics.pricing_disclosure')}</p>
        )}
        {rows.length === 0 && !ranking.loading ? (
          <EmptyState
            title={t('analytics.no_data_title')}
            description={t('analytics.no_keys_in_range', {
              defaultValue: 'Key activity and configured keys will appear here.',
            })}
          />
        ) : isMobile ? (
          <div className={styles.cardList}>
            {rows.map((row) => {
              const tokens = formatCompactTokens(row.total_tokens, i18n.resolvedLanguage);
              const cost = formatCostValue(row.known_cost_usd, i18n.resolvedLanguage);
              const generation =
                row.generation_time_ms === null
                  ? t('analytics.unknown_value', { defaultValue: 'Unknown' })
                  : formatAccumulatedDuration(row.generation_time_ms, i18n.resolvedLanguage);
              const unpriced = formatCompactTokens(row.unpriced_tokens, i18n.resolvedLanguage);
              const share = formatPercent(row.percent_of_total, i18n.resolvedLanguage);
              return (
                <Card key={row.key_id} className={styles.keyCard}>
                  <div className={styles.keyCardHead}>
                    <span title={row.short_key_id}>{analyticsKeyIdentity(row)}</span>
                    <KeyStatus row={row} />
                  </div>
                  <dl className={styles.keyCardMetrics}>
                    <div>
                      <dt>{t('analytics.rank', { defaultValue: 'Rank' })}</dt>
                      <dd>{row.rank ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('analytics.total_requests', { defaultValue: 'Total requests' })}</dt>
                      <dd>{formatNumber(row.requests, i18n.resolvedLanguage)}</dd>
                    </div>
                    <div>
                      <dt>{t('analytics.total_tokens', { defaultValue: 'Total tokens' })}</dt>
                      <dd title={tokens.title}>{tokens.text}</dd>
                    </div>
                    <div>
                      <dt>{t('analytics.top_model', { defaultValue: 'Top model' })}</dt>
                      <dd>
                        <TopModelValue row={row} />
                      </dd>
                    </div>
                    <div>
                      <dt>{t('analytics.generation_time', { defaultValue: 'Generation time' })}</dt>
                      <dd
                        title={
                          row.generation_time_ms === null
                            ? undefined
                            : `${row.generation_time_ms} ms`
                        }
                      >
                        {generation}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('analytics.unpriced_tokens', { defaultValue: 'Unpriced tokens' })}</dt>
                      <dd title={unpriced.title}>{unpriced.text}</dd>
                    </div>
                    <div>
                      <dt>{t('analytics.share', { defaultValue: 'Share' })}</dt>
                      <dd>{share}</dd>
                    </div>
                    <div>
                      <dt>
                        {t('analytics.known_cost', {
                          defaultValue: 'Estimated API-equivalent cost',
                        })}
                      </dt>
                      <dd title={cost.title}>{cost.text}</dd>
                    </div>
                    <div>
                      <dt>{t('analytics.config_indexes', { defaultValue: 'Config indexes' })}</dt>
                      <dd>
                        {row.config_indexes?.length
                          ? row.config_indexes
                              .map((index) => formatNumber(index, i18n.resolvedLanguage))
                              .join(', ')
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('analytics.first_activity', { defaultValue: 'First activity' })}</dt>
                      <dd>
                        <ActivityValue lifetimeValue={row.lifetime_first_activity_at} />
                      </dd>
                    </div>
                    <div>
                      <dt>{t('analytics.last_activity', { defaultValue: 'Last activity' })}</dt>
                      <dd>
                        <ActivityValue lifetimeValue={row.lifetime_last_activity_at} />
                      </dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </div>
        ) : (
          <Table className={styles.keysTable} aria-label={t('analytics.keys_catalog')}>
            <TableHeader>
              <TableRow>
                {SORTABLE_COLUMNS.map((column) => {
                  const label = t(column.labelKey, { defaultValue: column.defaultValue });
                  const description = t(column.descriptionKey, {
                    defaultValue: column.descriptionDefault,
                  });
                  return (
                    <CatalogHeader
                      key={column.id}
                      column={column}
                      active={activeColumnSort === column.id}
                      direction={activeDirection}
                      onClick={() => chooseColumnSort(column.id)}
                      label={label}
                      description={description}
                    />
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const share = Math.max(0, Math.min(100, Number(row.percent_of_total) || 0));
                return (
                  <TableRow key={row.key_id}>
                    <TableCell alignRight>{row.rank ?? '—'}</TableCell>
                    <TableCell title={row.short_key_id}>{analyticsKeyIdentity(row)}</TableCell>
                    <TableCell>
                      <KeyStatus row={row} />
                    </TableCell>
                    <TableCell alignRight>
                      {formatCompactTokens(row.total_tokens, i18n.resolvedLanguage).text}
                    </TableCell>
                    <TableCell alignRight>
                      {formatCostValue(row.known_cost_usd, i18n.resolvedLanguage).text}
                    </TableCell>
                    <TableCell alignRight>
                      {formatCompactTokens(row.unpriced_tokens, i18n.resolvedLanguage).text}
                    </TableCell>
                    <TableCell alignRight>
                      <span className={styles.shareValue}>
                        <span className={styles.shareTrack} aria-hidden="true">
                          <span style={{ '--share-width': `${share}%` } as CSSProperties} />
                        </span>
                        {formatPercent(row.percent_of_total, i18n.resolvedLanguage)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <TopModelValue row={row} />
                    </TableCell>
                    <TableCell alignRight>
                      <span
                        title={
                          row.generation_time_ms === null
                            ? undefined
                            : `${row.generation_time_ms} ms`
                        }
                      >
                        {row.generation_time_ms === null
                          ? t('analytics.unknown_value', { defaultValue: 'Unknown' })
                          : formatAccumulatedDuration(
                              row.generation_time_ms,
                              i18n.resolvedLanguage
                            )}
                      </span>
                    </TableCell>
                    <TableCell alignRight>
                      {formatNumber(row.requests, i18n.resolvedLanguage)}
                    </TableCell>
                    <TableCell alignRight>
                      {row.config_indexes?.length
                        ? row.config_indexes
                            .map((index) => formatNumber(index, i18n.resolvedLanguage))
                            .join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <ActivityValue lifetimeValue={row.lifetime_first_activity_at} />
                    </TableCell>
                    <TableCell>
                      <ActivityValue lifetimeValue={row.lifetime_last_activity_at} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </AsyncState>
  );
}
