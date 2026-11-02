import { beforeAll, describe, expect, test } from 'bun:test';
import i18n from '@/i18n';
import { configSaveErrorMessage } from '@/features/config/hooks/useConfigDocument';
import { ConfigDraftConflictError } from '@/services/api/configPatch';

const apiError = (message: string, apiCode: string, details?: unknown) =>
  Object.assign(new Error(message), { name: 'ApiError', apiCode, details });

describe('config save error messages', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init();
    await i18n.changeLanguage('en');
  });

  test('explains a stale If-Match instead of showing the raw code', () => {
    const message = configSaveErrorMessage(
      apiError('precondition_failed', 'precondition_failed'),
      i18n.t
    );
    expect(message).toContain('changed on the server');
    expect(message).not.toContain('precondition_failed');
  });

  test('names the read-only field as a YAML path', () => {
    const err = apiError('read_only_field', 'read_only_field', {
      error: 'read_only_field',
      field: 'credentials/concurrency/lifecycle-config-revision',
    });
    expect(configSaveErrorMessage(err, i18n.t)).toStartWith(
      'credentials.concurrency.lifecycle-config-revision is managed by the server'
    );
  });

  test("passes the server's message through, e.g. the YAML parser line", () => {
    const err = apiError("yaml: line 5: did not find expected ',' or ']'", 'invalid_body');
    expect(configSaveErrorMessage(err, i18n.t)).toBe(
      "yaml: line 5: did not find expected ',' or ']'"
    );
  });

  test('keeps the concurrent list conflict message', () => {
    const message = configSaveErrorMessage(
      new ConfigDraftConflictError(['routing', 'rules']),
      i18n.t
    );
    expect(message).toContain('routing.rules');
  });

  test('every locale defines the new keys', () => {
    for (const lng of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
      for (const key of ['server_changed_on_save', 'read_only_field']) {
        expect(i18n.exists(`config_management.${key}`, { lng, fallbackLng: false })).toBe(true);
      }
    }
  });
});
