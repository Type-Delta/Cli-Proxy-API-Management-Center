import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { analyticsApi } from '@/services/api';
import type { AnalyticsJob, AnalyticsRepriceRequest, PricingRule } from '@/types';
import { useNotificationStore } from '@/stores';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import { AsyncState } from '../components/AnalyticsShared';
import {
  formatAnalyticsEnum,
  formatDateTime,
  formatNumber,
} from '../components/analyticsFormatting';
import { analyticsRangeLabel } from '../query';
import { useAnalyticsLoad as useLoad } from '../useAnalyticsLoad';
import { ANALYTICS_TABLE_PAGE_SIZE, TablePagination } from '../components/TablePagination';
import {
  buildRepriceRequestFromRange,
  draftToPricingRule,
  duplicatePricingMatch,
  pricingRuleToDraft,
  pricingOverridesForWrite,
  pricingRulesForDisplay,
  isPricingCatalogRefreshing,
  upsertPricingOverride,
  type PricingRuleDraft,
  validatePricingRuleDraft,
} from './manage/pricingValidation';
import styles from '../Analytics.module.scss';
import { IconPlus } from '@/components/ui/icons';

const text = (key: string, defaultValue: string, options?: Record<string, unknown>) => ({
  defaultValue: defaultValue || key,
  ...options,
});

const newRule = (): PricingRuleDraft => ({
  rule_id: `rule-${Date.now()}`,
  provider: '',
  match_type: 'model',
  match_value: '',
  input_per_million_usd: '',
  output_per_million_usd: '',
  cache_read_multiplier: '1',
  cache_creation_multiplier: '1',
  source: 'management-api',
});

const errorText = (key: string | undefined, t: ReturnType<typeof useTranslation>['t']) => {
  if (!key) return undefined;
  const messages: Record<string, string> = {
    required: 'Required',
    nonnegative: 'Enter a non-negative number',
    paired: 'Enter both input and output prices, or leave both blank',
  };
  const translationKey = `analytics.pricing_validation_${key}`;
  return t(translationKey, text(translationKey, messages[key] ?? 'Invalid value'));
};

export function Pricing() {
  const { t, i18n } = useTranslation();
  const notify = useNotificationStore((state) => state.showNotification);
  const result = useLoad(() => analyticsApi.pricing(), 'pricing');
  const [editor, setEditor] = useState<PricingRuleDraft | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [rulesPageState, setRulesPage] = useState(1);
  const [missingPageState, setMissingPage] = useState(1);
  const catalogRefreshAttempts = useRef(0);
  const displayRules = result.data ? pricingRulesForDisplay(result.data) : [];
  const catalogSource = result.data?.catalog_source ?? 'models.dev';
  const catalogUpdatedAt = result.data?.catalog_updated_at ?? result.data?.updated_at;
  const catalogExpiresAt = result.data?.catalog_expires_at;
  const overrideRuleIds = result.data
    ? new Set(pricingOverridesForWrite(result.data).map((rule) => rule.rule_id))
    : new Set<string>();
  const catalogRefreshing = isPricingCatalogRefreshing(result.data?.sync_state);
  const refreshPricing = result.refresh;

  useEffect(() => {
    if (!catalogRefreshing) {
      catalogRefreshAttempts.current = 0;
      return;
    }
    if (catalogRefreshAttempts.current >= 12) return;
    catalogRefreshAttempts.current += 1;
    const timer = window.setTimeout(() => void refreshPricing(), 1000);
    return () => window.clearTimeout(timer);
  }, [catalogRefreshing, result.data, refreshPricing]);

  const rulesPage = Math.min(
    rulesPageState,
    Math.max(1, Math.ceil(displayRules.length / ANALYTICS_TABLE_PAGE_SIZE))
  );
  const missingPage = Math.min(
    missingPageState,
    Math.max(1, Math.ceil((result.data?.missing.length ?? 0) / ANALYTICS_TABLE_PAGE_SIZE))
  );

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(displayRules.length / ANALYTICS_TABLE_PAGE_SIZE)
    );
    setRulesPage((page) => Math.min(page, totalPages));
  }, [displayRules.length]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil((result.data?.missing.length ?? 0) / ANALYTICS_TABLE_PAGE_SIZE)
    );
    setMissingPage((page) => Math.min(page, totalPages));
  }, [result.data?.missing.length]);

  const visibleRules = displayRules.slice(
    (rulesPage - 1) * ANALYTICS_TABLE_PAGE_SIZE,
    rulesPage * ANALYTICS_TABLE_PAGE_SIZE
  );
  const visibleMissing = result.data?.missing.slice(
    (missingPage - 1) * ANALYTICS_TABLE_PAGE_SIZE,
    missingPage * ANALYTICS_TABLE_PAGE_SIZE
  );

  const openAdd = () => {
    setEditingId(undefined);
    setEditor(newRule());
  };
  const openEdit = (rule: PricingRule) => {
    setEditingId(rule.rule_id);
    setEditor(pricingRuleToDraft(rule));
  };

  const saveRule = async () => {
    if (!editor || !result.data) return;
    const errors = validatePricingRuleDraft(editor);
    if (
      Object.keys(errors).length > 0 ||
      duplicatePricingMatch(pricingOverridesForWrite(result.data), editor, editingId)
    ) {
      notify(
        t(
          'analytics.pricing_invalid',
          text('analytics.pricing_invalid', 'Fix the highlighted pricing rule fields.')
        ),
        'error'
      );
      return;
    }
    const rule = draftToPricingRule(editor);
    if (!rule) return;
    setSaving(true);
    try {
      const currentOverrides = pricingOverridesForWrite(result.data);
      const rules = upsertPricingOverride(currentOverrides, rule, editingId);
      await analyticsApi.updatePricing({
        currency_unit: result.data.currency_unit,
        rounding: result.data.rounding,
        rules,
      });
      setEditor(null);
      notify(
        t('analytics.pricing_saved', text('analytics.pricing_saved', 'Pricing rules saved.')),
        'success'
      );
      await result.refresh();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t('common.error', text('common.error', 'Request failed')),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (rule: PricingRule) => {
    const currentOverrides = result.data ? pricingOverridesForWrite(result.data) : [];
    if (!result.data || !currentOverrides.some((current) => current.rule_id === rule.rule_id)) {
      notify(
        t(
          'analytics.pricing_discovered_read_only',
          text(
            'analytics.pricing_discovered_read_only',
            'Discovered prices are refreshed automatically. Edit a row to create an override.'
          )
        ),
        'info'
      );
      return;
    }
    if (
      !window.confirm(
        t(
          'analytics.pricing_remove_confirm',
          text('analytics.pricing_remove_confirm', `Remove pricing rule ${rule.rule_id}?`)
        )
      )
    )
      return;
    setSaving(true);
    try {
      await analyticsApi.updatePricing({
        currency_unit: result.data.currency_unit,
        rounding: result.data.rounding,
        rules: currentOverrides.filter((current) => current.rule_id !== rule.rule_id),
      });
      notify(
        t('analytics.pricing_saved', text('analytics.pricing_saved', 'Pricing rules saved.')),
        'success'
      );
      await result.refresh();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t('common.error', text('common.error', 'Request failed')),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AsyncState
      loading={result.loading}
      error={result.error}
      errorStatus={result.errorStatus}
      retryAt={result.retryAt}
      onRetry={() => void result.refresh()}
    >
      {result.data && (
        <div className={styles.detailStack}>
          <Card
            title={t('analytics.pricing', text('analytics.pricing', 'Pricing'))}
            extra={
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={openAdd}
                >
                  <IconPlus size={16} />
                  <span>
                    {t(
                      'analytics.pricing_add_rule',
                      text('analytics.pricing_add_rule', 'Add rule')
                    )}
                  </span>
                </button>
              </div>
            }
          >
            <p>
              {t(
                'analytics.pricing_state',
                text('analytics.pricing_state', '{{rounding}}', {
                  rounding: formatAnalyticsEnum(t, 'rounding', result.data.rounding),
                })
              )}
            </p>
            <p>
              {t(
                'analytics.pricing_provenance',
                text(
                  'analytics.pricing_provenance',
                  'Prices are per million tokens. Match provenance and update time are retained with each rule.'
                )
              )}
            </p>
            <p>
              {t(
                'analytics.pricing_estimate_note',
                text(
                  'analytics.pricing_estimate_note',
                  'Displayed costs are API-equivalent estimates based on token usage and catalog rates; they do not represent subscription billing.'
                )
              )}
            </p>
            <p>
              {t(
                'analytics.pricing_catalog_state',
                text(
                  'analytics.pricing_catalog_state',
                  '{{source}} prices are loaded when this page is opened and cached for 6 hours. CPA refreshes only while it has active users.',
                  { source: catalogSource }
                )
              )}
              {catalogUpdatedAt
                ? ` ${t(
                    'analytics.pricing_catalog_updated',
                    text('analytics.pricing_catalog_updated', 'Last catalog update: {{time}}.', {
                      time: formatDateTime(
                        catalogUpdatedAt,
                        i18n.resolvedLanguage
                      ),
                    })
                  )}`
                : ''}
              {catalogExpiresAt
                ? ` ${t(
                    'analytics.pricing_catalog_expires',
                    text('analytics.pricing_catalog_expires', 'Cached until {{time}}.', {
                      time: formatDateTime(catalogExpiresAt, i18n.resolvedLanguage),
                    })
                  )}`
                : ''}
            </p>
            {result.data.sync_state === 'stale' && (
              <p role="status">
                {t(
                  'analytics.pricing_catalog_stale',
                  text(
                    'analytics.pricing_catalog_stale',
                    'Catalog refresh is delayed; showing the last successful catalog.'
                  )
                )}
              </p>
            )}
            {result.data.sync_state === 'unavailable' && (
              <p role="alert">
                {t(
                  'analytics.pricing_catalog_unavailable',
                  text(
                    'analytics.pricing_catalog_unavailable',
                    'The pricing catalog is unavailable. Add a manual rule or try again later.'
                  )
                )}
              </p>
            )}
            {displayRules.length === 0 && catalogRefreshing ? (
              <EmptyState
                title={t(
                  'analytics.pricing_catalog_refreshing',
                  text('analytics.pricing_catalog_refreshing', 'Loading pricing catalog')
                )}
                description={t(
                  'analytics.pricing_catalog_refreshing_description',
                  text(
                    'analytics.pricing_catalog_refreshing_description',
                    'CPA is fetching the cached catalog. This page will update automatically.'
                  )
                )}
              />
            ) : displayRules.length === 0 ? (
              <EmptyState
                title={t(
                  'analytics.pricing_empty',
                  text('analytics.pricing_empty', 'No pricing rules')
                )}
                description={t(
                  'analytics.pricing_empty_description',
                  text(
                    'analytics.pricing_empty_description',
                    'Add a model or alias rule to calculate cost.'
                  )
                )}
                action={
                  <Button onClick={openAdd}>
                    {t(
                      'analytics.pricing_add_rule',
                      text('analytics.pricing_add_rule', 'Add pricing rule')
                    )}
                  </Button>
                }
              />
            ) : (
              <>
                <Table
                  aria-label={t(
                    'analytics.pricing_rules',
                    text('analytics.pricing_rules', 'Pricing rules')
                  )}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('analytics.pricing_match', text('analytics.pricing_match', 'Match'))}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.pricing_input',
                          text('analytics.pricing_input', 'Input / 1M')
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.pricing_output',
                          text('analytics.pricing_output', 'Output / 1M')
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.pricing_cache',
                          text('analytics.pricing_cache', 'Cache multipliers')
                        )}
                      </TableHead>
                      <TableHead>
                        {t('analytics.pricing_source', text('analytics.pricing_source', 'Source'))}
                      </TableHead>
                      <TableHead className={styles.stickyAction}>
                        {t('common.action', text('common.action', 'Action'))}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRules?.map((rule) => (
                      <TableRow key={rule.rule_id}>
                        <TableCell>
                          <strong>
                            {rule.match.provider ? `${rule.match.provider}/` : ''}
                            {rule.match.model ?? rule.match.alias}
                          </strong>
                          <br />
                          <small>
                            {rule.match.model
                              ? t(
                                  'analytics.pricing_model',
                                  text('analytics.pricing_model', 'Model')
                                )
                              : t(
                                  'analytics.pricing_alias',
                                  text('analytics.pricing_alias', 'Alias')
                                )}
                          </small>
                        </TableCell>
                        <TableCell>
                          {rule.input_per_million_usd ??
                            t(
                              'analytics.pricing_missing_value',
                              text('analytics.pricing_missing_value', 'Missing')
                            )}
                        </TableCell>
                        <TableCell>
                          {rule.output_per_million_usd ??
                            t(
                              'analytics.pricing_missing_value',
                              text('analytics.pricing_missing_value', 'Missing')
                            )}
                        </TableCell>
                        <TableCell>
                          {rule.cache_read_multiplier ?? '1'} /{' '}
                          {rule.cache_creation_multiplier ?? '1'}
                        </TableCell>
                        <TableCell>
                          {rule.source === 'models.dev'
                            ? rule.source
                            : t(
                                'analytics.pricing_override',
                                text('analytics.pricing_override', 'Manual override')
                              )}
                          <br />
                          <small>
                            {rule.updated_at
                              ? formatDateTime(rule.updated_at, i18n.resolvedLanguage)
                              : '—'}
                          </small>
                        </TableCell>
                        <TableCell className={styles.stickyAction}>
                          <div className={styles.actions}>
                            <Button size="sm" variant="secondary" onClick={() => openEdit(rule)}>
                              {t('common.edit', text('common.edit', 'Edit'))}
                            </Button>
                            {overrideRuleIds.has(rule.rule_id) && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void removeRule(rule)}
                                disabled={saving}
                              >
                                {t('common.delete', text('common.delete', 'Delete'))}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={rulesPage}
                  totalItems={displayRules.length}
                  onPageChange={setRulesPage}
                />
              </>
            )}
          </Card>
          <Card
            title={t(
              'analytics.pricing_missing_title',
              text('analytics.pricing_missing_title', 'Missing prices')
            )}
          >
            {result.data.missing.length === 0 ? (
              <EmptyState
                title={t(
                  'analytics.pricing_missing_none',
                  text('analytics.pricing_missing_none', 'All observed models are priced')
                )}
              />
            ) : (
              <>
                <p role="alert">
                  {t(
                    'analytics.pricing_missing_warning',
                    text(
                      'analytics.pricing_missing_warning',
                      'Some usage has no matching price. Reprice after adding rules to update historical cost.'
                    )
                  )}
                </p>
                <Table
                  aria-label={t(
                    'analytics.pricing_missing_title',
                    text('analytics.pricing_missing_title', 'Missing prices')
                  )}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('analytics.provider', text('analytics.provider', 'Provider'))}
                      </TableHead>
                      <TableHead>
                        {t('analytics.model', text('analytics.model', 'Model'))}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.pricing_requests',
                          text('analytics.pricing_requests', 'Requests')
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.unpriced_tokens',
                          text('analytics.unpriced_tokens', 'Unpriced tokens')
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'analytics.pricing_first_seen',
                          text('analytics.pricing_first_seen', 'First seen')
                        )}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMissing?.map((missing) => (
                      <TableRow key={`${missing.provider}:${missing.model}`}>
                        <TableCell>{missing.provider}</TableCell>
                        <TableCell>{missing.model}</TableCell>
                        <TableCell>
                          {formatNumber(missing.requests, i18n.resolvedLanguage)}
                        </TableCell>
                        <TableCell>
                          {formatNumber(missing.unpriced_tokens, i18n.resolvedLanguage)}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(missing.first_seen, i18n.resolvedLanguage)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={missingPage}
                  totalItems={result.data.missing.length}
                  onPageChange={setMissingPage}
                />
              </>
            )}
          </Card>
          <RepricePanel notify={notify} />
        </div>
      )}
      <RuleEditor
        open={editor !== null}
        draft={editor}
        rules={result.data?.rules ?? []}
        editingId={editingId}
        saving={saving}
        onChange={setEditor}
        onClose={() => setEditor(null)}
        onSave={() => void saveRule()}
      />
    </AsyncState>
  );
}

function RuleEditor({
  open,
  draft,
  rules,
  editingId,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  draft: PricingRuleDraft | null;
  rules: PricingRule[];
  editingId?: string;
  saving: boolean;
  onChange: (draft: PricingRuleDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  if (!draft) return null;
  const errors = validatePricingRuleDraft(draft);
  const duplicate = duplicatePricingMatch(rules, draft, editingId);
  const update = <K extends keyof PricingRuleDraft>(key: K, value: PricingRuleDraft[K]) =>
    onChange({ ...draft, [key]: value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={t(
        'analytics.pricing_editor_title',
        text('analytics.pricing_editor_title', editingId ? 'Edit pricing rule' : 'Add pricing rule')
      )}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', text('common.cancel', 'Cancel'))}
          </Button>
          <Button onClick={onSave} loading={saving}>
            {t('common.save', text('common.save', 'Save'))}
          </Button>
        </div>
      }
    >
      <div className={styles.detailStack}>
        <Input
          label={t('analytics.pricing_rule_id', text('analytics.pricing_rule_id', 'Rule ID'))}
          value={draft.rule_id}
          onChange={(event) => update('rule_id', event.target.value)}
          error={errorText(errors.rule_id, t)}
          disabled={Boolean(editingId) || saving}
        />
        <Input
          label={t('analytics.pricing_provider', text('analytics.pricing_provider', 'Provider'))}
          value={draft.provider}
          onChange={(event) => update('provider', event.target.value)}
          hint={t(
            'analytics.pricing_provider_hint',
            text(
              'analytics.pricing_provider_hint',
              'Leave blank to match this model across providers.'
            )
          )}
          disabled={saving}
        />
        <label>
          <span>
            {t('analytics.pricing_match_type', text('analytics.pricing_match_type', 'Match type'))}
          </span>
          <Select
            value={draft.match_type}
            onChange={(value) => update('match_type', value as 'model' | 'alias')}
            options={[
              {
                value: 'model',
                label: t('analytics.pricing_model', text('analytics.pricing_model', 'Model')),
              },
              {
                value: 'alias',
                label: t('analytics.pricing_alias', text('analytics.pricing_alias', 'Alias')),
              },
            ]}
            ariaLabel={t(
              'analytics.pricing_match_type',
              text('analytics.pricing_match_type', 'Match type')
            )}
            disabled={saving}
          />
        </label>
        <Input
          label={t(
            'analytics.pricing_match_value',
            text('analytics.pricing_match_value', 'Model or alias')
          )}
          value={draft.match_value}
          onChange={(event) => update('match_value', event.target.value)}
          error={
            duplicate
              ? t(
                  'analytics.pricing_duplicate',
                  text('analytics.pricing_duplicate', 'This match already has a rule.')
                )
              : errorText(errors.match_value, t)
          }
          disabled={saving}
        />
        <Input
          label={t(
            'analytics.pricing_input',
            text('analytics.pricing_input', 'Input price / 1M USD')
          )}
          type="number"
          min="0"
          step="any"
          value={draft.input_per_million_usd}
          onChange={(event) => update('input_per_million_usd', event.target.value)}
          error={errorText(errors.input_per_million_usd, t)}
          hint={t(
            'analytics.pricing_blank_unknown',
            text(
              'analytics.pricing_blank_unknown',
              'Leave both input and output blank when the price is unknown.'
            )
          )}
          disabled={saving}
        />
        <Input
          label={t(
            'analytics.pricing_output',
            text('analytics.pricing_output', 'Output price / 1M USD')
          )}
          type="number"
          min="0"
          step="any"
          value={draft.output_per_million_usd}
          onChange={(event) => update('output_per_million_usd', event.target.value)}
          error={errorText(errors.output_per_million_usd, t)}
          disabled={saving}
        />
        <Input
          label={t(
            'analytics.pricing_cache_read_multiplier',
            text('analytics.pricing_cache_read_multiplier', 'Cache read multiplier')
          )}
          type="number"
          min="0"
          step="any"
          value={draft.cache_read_multiplier}
          onChange={(event) => update('cache_read_multiplier', event.target.value)}
          error={errorText(errors.cache_read_multiplier, t)}
          disabled={saving}
        />
        <Input
          label={t(
            'analytics.pricing_cache_creation_multiplier',
            text('analytics.pricing_cache_creation_multiplier', 'Cache write multiplier')
          )}
          type="number"
          min="0"
          step="any"
          value={draft.cache_creation_multiplier}
          onChange={(event) => update('cache_creation_multiplier', event.target.value)}
          error={errorText(errors.cache_creation_multiplier, t)}
          disabled={saving}
        />
        <Input
          label={t(
            'analytics.pricing_source',
            text('analytics.pricing_source', 'Source / provenance')
          )}
          value={draft.source}
          onChange={(event) => update('source', event.target.value)}
          error={errorText(errors.source, t)}
          hint={t(
            'analytics.pricing_source_hint',
            text(
              'analytics.pricing_source_hint',
              'Record where this price came from, such as models.dev or a management override.'
            )
          )}
          disabled={saving}
        />
      </div>
    </Modal>
  );
}

function RepricePanel({
  notify,
}: {
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const { t } = useTranslation();
  const { range, resolvedRange } = useAnalyticsFilters();
  const [dryRun, setDryRun] = useState(true);
  const [job, setJob] = useState<AnalyticsJob | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<AnalyticsRepriceRequest | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!job || ['succeeded', 'failed', 'canceled'].includes(job.state)) return;
    const timer = window.setInterval(() => {
      void analyticsApi
        .job(job.job_id)
        .then(setJob)
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);
  const start = async (resume = false) => {
    const request =
      resume && submittedRequest
        ? { ...submittedRequest, resume: true }
        : buildRepriceRequestFromRange(resolvedRange, dryRun);
    setStarting(true);
    try {
      const next = await analyticsApi.reprice(request);
      setJob(next);
      setSubmittedRequest(request);
      notify(
        t('analytics.reprice_started', text('analytics.reprice_started', 'Reprice job started.')),
        'info'
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t('common.error', text('common.error', 'Request failed')),
        'error'
      );
    } finally {
      setStarting(false);
    }
  };
  return (
    <Card
      title={t(
        'analytics.reprice_title',
        text('analytics.reprice_title', 'Reprice historical usage')
      )}
    >
      <p>
        {t(
          'analytics.reprice_description',
          text(
            'analytics.reprice_description',
            'Run an explicit, resumable reprice job after changing rules or finding missing prices. Dry run reports the affected range without writing costs.'
          )
        )}
      </p>
      <div className={styles.detailStack}>
        <p className={styles.repriceRange}>
          {t(
            'analytics.reprice_active_range',
            text(
              'analytics.reprice_active_range',
              'Range: {{range}} ({{start}} → {{end}}). Change it from the range control on Overview, Analysis, Keys, or Events.',
              {
                range: analyticsRangeLabel(t, range),
                start: resolvedRange.start,
                end: resolvedRange.end,
              }
            )
          )}
        </p>
        <ToggleSwitch
          checked={dryRun}
          onChange={setDryRun}
          label={t('analytics.dry_run', text('analytics.dry_run', 'Dry run'))}
          ariaLabel={t('analytics.dry_run', text('analytics.dry_run', 'Dry run'))}
        />
        <div className={styles.actions}>
          <Button onClick={() => void start()} loading={starting}>
            {t('analytics.reprice_start', text('analytics.reprice_start', 'Start reprice'))}
          </Button>
          {job?.checkpoint && job.state !== 'succeeded' && (
            <Button variant="secondary" onClick={() => void start(true)} disabled={starting}>
              {t('analytics.reprice_resume', text('analytics.reprice_resume', 'Resume job'))}
            </Button>
          )}
        </div>
      </div>
      {job && (
        <p role="status">
          {t(
            'analytics.reprice_job_status',
            text('analytics.reprice_job_status', 'Job {{kind}}: {{state}} ({{progress}}%)', {
              kind: formatAnalyticsEnum(t, 'job_kind', job.kind),
              state: formatAnalyticsEnum(t, 'job_state', job.state),
              progress: job.progress_percent,
            })
          )}
          {job.checkpoint
            ? ` · ${t('analytics.reprice_checkpoint', text('analytics.reprice_checkpoint', 'Checkpoint'))}: ${job.checkpoint}`
            : ''}
        </p>
      )}
      {job?.state === 'succeeded' && job.result?.history_complete === false && (
        <div className="error-box" role="status">
          {t(
            'analytics.reprice_retained_only',
            text(
              'analytics.reprice_retained_only',
              'Repricing started at the retained-history cutoff {{cutoff}}. Older deleted history was not repriced.',
              { cutoff: job.result.retained_cutoff ?? job.result.effective_start ?? '—' }
            )
          )}
        </div>
      )}
    </Card>
  );
}
