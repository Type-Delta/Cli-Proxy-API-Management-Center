import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { analyticsApi } from '@/services/api';
import type {
  AnalyticsEventPage,
  AnalyticsKey,
  AnalyticsLeaderboard,
  AnalyticsRange as AnalyticsResolvedRange,
} from '@/types';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import { analyticsKeyIdentity } from '../analyticsKeyFilterModel';
import { AnalyticsStatusBadge, AsyncState, EventTable } from '../components/AnalyticsShared';
import { analyticsErrorCopy } from '../components/analyticsErrorCopy';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
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
import { Analysis } from './Analysis';
import { Overview } from './Overview';
import {
  joinKeyRanking,
  shouldShowPricingDisclosure,
  sortKeyRanking,
  type KeyColumnSort,
  type KeySortDirection,
} from './keys/keyRanking';
import styles from './keys/KeysView.module.scss';

const SORTABLE_COLUMNS: ReadonlyArray<{
  id: KeyColumnSort;
  labelKey: string;
  defaultValue: string;
}> = [
  { id: 'server', labelKey: 'analytics.rank', defaultValue: 'Rank' },
  { id: 'key', labelKey: 'analytics.key', defaultValue: 'Key' },
  { id: 'status', labelKey: 'common.status', defaultValue: 'Status' },
  { id: 'first_activity', labelKey: 'analytics.first_activity', defaultValue: 'First activity' },
  { id: 'last_activity', labelKey: 'analytics.last_activity', defaultValue: 'Last activity' },
  { id: 'indexes', labelKey: 'analytics.config_indexes', defaultValue: 'Config indexes' },
  { id: 'tokens', labelKey: 'analytics.total_tokens', defaultValue: 'Total tokens' },
  { id: 'cost', labelKey: 'analytics.known_cost', defaultValue: 'Known API cost' },
  { id: 'unpriced', labelKey: 'analytics.unpriced_tokens', defaultValue: 'Unpriced tokens' },
  { id: 'share', labelKey: 'analytics.share', defaultValue: 'Share' },
];

function ActivityValue({
  rangeValue,
  lifetimeValue,
}: {
  rangeValue: string | null;
  lifetimeValue: string | null;
}) {
  const { t, i18n } = useTranslation();
  return (
    <span className={styles.stackedValue}>
      <span title={rangeValue ?? undefined}>
        {t('analytics.activity_range_label', { defaultValue: 'Range' })}:{' '}
        {rangeValue ? formatDateTime(rangeValue, i18n.resolvedLanguage) : '—'}
      </span>
      <small title={lifetimeValue ?? undefined}>
        {t('analytics.activity_lifetime_label', { defaultValue: 'Lifetime' })}:{' '}
        {lifetimeValue ? formatDateTime(lifetimeValue, i18n.resolvedLanguage) : '—'}
      </small>
    </span>
  );
}

export function KeysView({
  keys,
  range,
  selected,
  setSelected,
}: {
  keys: AnalyticsKey[];
  range: AnalyticsRange;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
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
  const selectedKey =
    selected.length === 1 ? (keys.find((key) => key.key_id === selected[0]) ?? null) : null;
  const recentRequest = useMemo(
    () =>
      buildAnalyticsQuery('events', range, selectedKey ? [selectedKey.key_id] : [], {
        page_size: 25,
      }),
    [range, selectedKey]
  );
  const recent = useAnalyticsLoad(
    () => analyticsApi.events(recentRequest),
    JSON.stringify(recentRequest),
    Boolean(selectedKey)
  );
  useEffect(() => {
    if (ranking.data?.meta.range) reportResolvedRange(range, ranking.data.meta.range);
  }, [range, ranking.data?.meta.range, reportResolvedRange]);

  const chooseColumnSort = (next: KeyColumnSort) => {
    if (next === 'tokens' || next === 'cost') {
      setSort(next);
      setColumnSort('server');
      setDirection('asc');
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
    setDirection(next === 'key' || next === 'status' ? 'asc' : 'desc');
  };

  return (
    <>
      <AsyncState
        loading={ranking.loading}
        error=""
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
                const active = selectedKey?.key_id === row.key_id;
                return (
                  <Card key={row.key_id} className={styles.keyCard}>
                    <div className={styles.keyCardHead}>
                      <span title={row.short_key_id}>{analyticsKeyIdentity(row)}</span>
                      <AnalyticsStatusBadge category="key_status" value={row.status} />
                    </div>
                    <dl className={styles.keyCardMetrics}>
                      <div>
                        <dt>{t('analytics.proxy_requests')}</dt>
                        <dd>{formatNumber(row.proxy_requests, i18n.resolvedLanguage)}</dd>
                      </div>
                      <div>
                        <dt>{t('analytics.total_tokens')}</dt>
                        <dd title={tokens.title}>{tokens.text}</dd>
                      </div>
                      <div>
                        <dt>{t('analytics.known_cost')}</dt>
                        <dd title={cost.title}>{cost.text}</dd>
                      </div>
                    </dl>
                    <Button
                      variant={active ? 'primary' : 'secondary'}
                      onClick={() => setSelected([row.key_id])}
                    >
                      {active
                        ? t('analytics.viewing_key', { defaultValue: 'Viewing' })
                        : t('analytics.view_key', { defaultValue: 'View details' })}
                    </Button>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Table aria-label={t('analytics.keys_catalog')}>
              <TableHeader>
                <TableRow>
                  {SORTABLE_COLUMNS.map((column) => (
                    <TableHead
                      key={column.id}
                      aria-sort={
                        columnSort === column.id
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => chooseColumnSort(column.id)}
                      >
                        {t(column.labelKey, { defaultValue: column.defaultValue })}
                        {columnSort === column.id ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead>{t('common.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tokens = formatCompactTokens(row.total_tokens, i18n.resolvedLanguage);
                  const cost = formatCostValue(row.known_cost_usd, i18n.resolvedLanguage);
                  const share = Math.max(0, Math.min(100, Number(row.percent_of_total) || 0));
                  const active = selectedKey?.key_id === row.key_id;
                  return (
                    <TableRow key={row.key_id} selected={active}>
                      <TableCell>{row.rank ?? '—'}</TableCell>
                      <TableCell title={row.short_key_id}>{analyticsKeyIdentity(row)}</TableCell>
                      <TableCell>
                        <AnalyticsStatusBadge category="key_status" value={row.status} />
                      </TableCell>
                      <TableCell>
                        <ActivityValue
                          rangeValue={row.first_activity_at}
                          lifetimeValue={row.lifetime_first_activity_at}
                        />
                      </TableCell>
                      <TableCell>
                        <ActivityValue
                          rangeValue={row.last_activity_at}
                          lifetimeValue={row.lifetime_last_activity_at}
                        />
                      </TableCell>
                      <TableCell>
                        {row.config_indexes?.length
                          ? row.config_indexes
                              .map((index) => formatNumber(index, i18n.resolvedLanguage))
                              .join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell title={tokens.title}>{tokens.text}</TableCell>
                      <TableCell title={cost.title}>{cost.text}</TableCell>
                      <TableCell>
                        {(() => {
                          const unpriced = formatCompactTokens(
                            row.unpriced_tokens,
                            i18n.resolvedLanguage
                          );
                          return <span title={unpriced.title}>{unpriced.text}</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <span className={styles.shareValue}>
                          <span className={styles.shareTrack} aria-hidden="true">
                            <span style={{ width: `${share}%` }} />
                          </span>
                          {formatPercent(row.percent_of_total, i18n.resolvedLanguage)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={active ? 'primary' : 'secondary'}
                          onClick={() => setSelected([row.key_id])}
                        >
                          {active
                            ? t('analytics.viewing_key', { defaultValue: 'Viewing' })
                            : t('analytics.view_key', { defaultValue: 'View details' })}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </AsyncState>

      {selected.length > 1 && (
        <Card>
          <EmptyState
            title={t('analytics.choose_one_key', { defaultValue: 'Choose one key for details' })}
            description={t('analytics.choose_one_key_description', {
              defaultValue:
                'The key viewer shows Overview, Analysis, and recent events for one key at a time.',
            })}
          />
        </Card>
      )}

      {selectedKey && (
        <section
          className={styles.journey}
          aria-label={t('analytics.key_journey', {
            defaultValue: 'Key usage details',
          })}
        >
          <Card
            title={analyticsKeyIdentity(selectedKey)}
            extra={<AnalyticsStatusBadge category="key_status" value={selectedKey.status} />}
          >
            <p className={styles.disclosure}>
              {t('analytics.key_journey_description', {
                defaultValue:
                  'Overview, Analysis, and recent events are scoped to this key and the active range.',
              })}
            </p>
          </Card>
          <Overview range={range} keyIds={[selectedKey.key_id]} />
          <Analysis range={range} keyIds={[selectedKey.key_id]} />
          {recent.error && !recent.data ? (
            <Card>
              <EmptyState
                title={t('analytics.load_failed')}
                description={recent.error}
                action={
                  <Button variant="secondary" onClick={() => void recent.refresh()}>
                    {t('common.retry')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <AsyncState
              loading={recent.loading}
              error=""
              stale={recent.data?.meta.degraded}
              onRetry={() => void recent.refresh()}
            >
              {recent.data && (
                <>
                  {recent.error && (
                    <div className="error-box" role="alert">
                      <span>{recent.error}</span>
                      <Button variant="secondary" onClick={() => void recent.refresh()}>
                        {t('common.retry')}
                      </Button>
                    </div>
                  )}
                  <EventTable data={recent.data as AnalyticsEventPage} />
                </>
              )}
            </AsyncState>
          )}
        </section>
      )}
    </>
  );
}
