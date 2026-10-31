import { expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { apiCallApi } from '@/services/api/apiCall';
import { normalizeClaudeUsageSnapshot } from '@/services/api/claudeUsage';
import { CLAUDE_USAGE_URL } from '@/utils/quota';
import { CLAUDE_CONFIG } from '@/features/quota/providers/claude/data';
import { ClaudeQuotaBody } from '@/features/quota/providers/claude/ClaudeQuotaBody';
import { aggregateQuotaSummaries } from '@/features/quota/quotaSummary';
import { buildTimelineLane, projectLane } from '@/features/quota/quotaTimelineModel';
import { quotaHistoryInputs, quotaHistorySeries } from '@/features/quota/quotaHistoryModel';
import { extractQuotaCapBars } from '@/features/quota/quotaReserve';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import fixture from './fixtures/claude-ultra-usage.json';

test('verified Ultra without a five-hour limit retains weekly cards, summary, timeline, history and reserves', async () => {
  const translations = i18n.cloneInstance({ lng: 'en' });
  const now = Date.parse('2026-10-31T12:00:00Z');
  const file = { name: 'ultra.json', type: 'claude' as const, authIndex: 'ultra-fixture' };
  const entry = { file, type: 'claude' as const };
  const request = spyOn(apiCallApi, 'request').mockImplementation(async ({ url }) => {
    const body =
      url === CLAUDE_USAGE_URL
        ? fixture
        : {
            account: { has_claude_max: true },
            organization: { rate_limit_tier: 'default_claude_max_20x' },
          };
    return { statusCode: 200, header: {}, body, bodyText: JSON.stringify(body) };
  });
  try {
    expect(fixture.limits.some((limit) => String(limit.kind) === 'session')).toBe(false);
    expect(normalizeClaudeUsageSnapshot(fixture)?.fiveHour).toBeNull();
    const quota = CLAUDE_CONFIG.buildSuccessState(
      await CLAUDE_CONFIG.fetchQuota(file, translations.t)
    );
    expect(quota.planType).toBe('plan_max20');
    expect(translations.t('claude_quota.plan_max20')).toBe('Ultra');
    expect(quota.windows?.map((window) => window.id)).toEqual(['seven-day', 'seven-day-fable']);
    const classes = bindQuotaClasses(Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])));
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n: translations },
        createElement(ClaudeQuotaBody, { quota, classes, quotaReserves: { 'seven-day': 30 } })
      )
    );
    expect(markup).toContain(translations.t('claude_quota.seven_day'));
    expect(markup).not.toContain(translations.t('claude_quota.five_hour'));
    expect(markup.match(/class="quotaBarFill /g)).toHaveLength(2);
    expect(markup).not.toMatch(/NaN|undefined%|width:0%/);
    const [summary] = aggregateQuotaSummaries([entry], () => quota);
    expect(summary.primaryRemainingPercent).toBe(60);
    expect(summary.secondaryRemainingPercent).toBe(80);
    expect(summary.loadedCount).toBe(1);
    const lane = buildTimelineLane({
      provider: 'claude',
      name: file.name,
      displayName: file.name,
      quota,
    });
    expect(lane).toMatchObject({
      periodHours: 168,
      remaining: 80,
      anchorMs: Date.parse(fixture.seven_day.resets_at),
    });
    expect(projectLane(lane, now, now + 14 * 86400000, now, 'weekly').length).toBeGreaterThan(0);
    const session = buildTimelineLane({
      provider: 'claude',
      name: file.name,
      displayName: file.name,
      quota,
      maxPeriodHours: 5,
    });
    // The timeline host excludes non-5h lanes from its session view.
    expect(session.periodHours).not.toBe(5);
    expect(projectLane(session, now, now + 3 * 86400000, now, 'session')).toEqual([]);
    const inputs = quotaHistoryInputs(entry, quota);
    expect(inputs.map((input) => input.window_id)).toEqual(['seven-day', 'seven-day-fable']);
    const samples = inputs.map(({ auth_index: credential_id, ...input }) => ({
      ...input,
      credential_id,
      provider: 'claude',
      observed_at: new Date(now).toISOString(),
      source: 'cpamc' as const,
    }));
    const history = quotaHistorySeries('claude', samples, now, now + 86400000, now);
    expect(history.actual[0]).toEqual([now, 60]);
    expect(history.capacity[0]).toEqual([now, 100]);
    expect(history.projected.length).toBeGreaterThan(0);
    expect(history.projected.every(([, value]) => value === null || Number.isFinite(value))).toBe(
      true
    );
    const bars = extractQuotaCapBars('claude', quota, translations.t);
    expect(bars.map((bar) => bar.id)).toEqual(['seven-day', 'seven-day-fable']);
    expect(bars.map((bar) => bar.remainingPercent)).toEqual([80, 60]);
  } finally {
    request.mockRestore();
  }
});
