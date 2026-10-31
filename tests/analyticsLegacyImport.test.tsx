import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { HealthDetails } from '@/features/analytics/views/Maintenance';
import { loadMaintenanceHealth } from '@/features/analytics/views/manage/maintenanceModel';
import type { AnalyticsHealth, TelemetryHealth } from '@/types';

const health: AnalyticsHealth = {
  state: 'ready', queue: { capacity: 10, depth: 0, dropped: 0, max_bytes: 100 },
  last_successful_write_at: null, restart_count: 0, restart_window_seconds: 60,
  rejected_events: 0, truncated_fields: 0, abandoned_events: 0,
};

function render(value: AnalyticsHealth, language = 'en', telemetry?: TelemetryHealth | null) {
  const translations = i18n.cloneInstance({ lng: language });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: translations },
    createElement(HealthDetails, { health: value, telemetry, locale: language,
      copy: (key: string, defaultValue: string) => translations.t(key, { defaultValue }) })));
}

describe('legacy analytics import health', () => {
  test('a 503 telemetry response does not hide analytics health', async () => {
    const result = await loadMaintenanceHealth(async () => health, async () => {
      throw Object.assign(new Error('unavailable'), { status: 503 });
    });
    expect(result.analytics).toEqual(health);
    expect(result.telemetry).toBeNull();
    expect(render(result.analytics, 'en', result.telemetry)).not.toContain('Legacy request-log import');
  });
  test('shows completed counts and hides absent status', () => {
    expect(render(health)).not.toContain('Legacy analytics import');
    const html = render({ ...health, legacy_import: { state: 'done', counts: { events: 1234, rollups: 2, request_rollups: 3 } } });
    expect(html).toContain('Legacy analytics import');
    expect(html).toContain('Done');
    expect(html).toContain('1,234');
    expect(html).toContain('Request rollups');
  });
  test('shows states and failure reason without stale counts', () => {
    const labels: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      failed: 'Failed',
      abandoned: 'Abandoned',
    };
    for (const state of Object.keys(labels)) {
      const html = render({ ...health, legacy_import: { state, reason: 'disk unavailable', counts: { events: 42 } } });
      expect(html).toContain(labels[state]);
      expect(html.includes('disk unavailable')).toBe(state === 'failed' || state === 'abandoned');
      expect(html).not.toContain('Events: 42');
    }
  });
  test('shows request-log import beside analytics and hides absent telemetry', () => {
    const analytics = { ...health, legacy_import: { state: 'done', counts: { events: 7 } } };
    expect(render(analytics, 'en', null)).not.toContain('Legacy request-log import');
    expect(render(analytics, 'en', { backlog_files: 2 })).not.toContain('Legacy request-log import');
    const html = render(analytics, 'en', { backlog_files: 2, legacy_import: { state: 'done', counts: { files_seen: 5, imported: 3, skipped_unparseable: 2, records: 3 } } });
    expect(html).toContain('Legacy analytics import');
    expect(html).toContain('Legacy request-log import');
    expect(html).toContain('Imported files: 3');
    expect(html).toContain('Unparseable files: 2');
    const failed = render(health, 'en', { backlog_files: 0, legacy_import: { state: 'failed', reason: 'bad log' } });
    expect(failed).toContain('bad log');
  });
  test('provides status and retention copy in every locale', () => {
    for (const language of ['en', 'ko', 'ru', 'vi', 'zh-CN', 'zh-TW', 'tr']) {
      const translations = i18n.cloneInstance({ lng: language });
      for (const key of ['analytics.maintenance.legacy_import', 'analytics.maintenance.legacy_request_log_import', 'analytics.maintenance.legacy_import_counts.imported', 'analytics.maintenance.legacy_import_states.done', 'analytics.maintenance.legacy_import_states.failed', 'analytics.maintenance.legacy_import_states.abandoned', 'analytics.maintenance.legacy_import_counts.events', 'config_management.visual.sections.analytics.clickhouse_retention_days_hint']) {
        expect(translations.getResource(language, 'translation', key)).toBeString();
      }
    }
  });
});
