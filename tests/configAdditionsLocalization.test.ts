import { describe, expect, test } from 'bun:test';
import { CONFIG_FIELD_SEARCH_INDEX } from '@/features/config/searchIndex';

const addedFieldIds = [
  'routingSessionAffinitySubagents',
  'saveCooldownStatus',
  'transientErrorCooldownSeconds',
  'videoResultAuthCacheTTL',
  'claudeHeaderTimezone',
  'claudeModelLevelCooling',
  'claudeDisableCloakMode',
  'claudeCodeDisableCloakingModelList',
  'codexDisableCloaking',
  'codexModelLevelCooling',
  'codexStreamBootstrapBuffering',
  'codexStreamBootstrapTimeout',
  'codexOptimizeMultiAgentV2',
  'codexOrphanDelegationCompatibility',
  'codexResponseSteering',
  'antigravityConnectionPoolEnabled',
  'antigravityConnectionPoolIdleTimeout',
  'antigravityConnectionPoolMaxIdleConnsPerHost',
  'xaiInjectXSearch',
  'codexLiveMediaRelayEnabled',
  'codexLiveMediaRelayMaxSessions',
  'codexLiveMediaRelayDisablePrivateRemoteIPs',
  'codexLiveMediaRelayPublicIP',
  'codexLiveMediaRelayUDPPortMin',
  'codexLiveMediaRelayUDPPortMax',
  'codexLiveMediaRelayICEServers',
];

function resolveKey(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

describe('added configuration field localization', () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
    test(`${locale} includes searchable labels, help, and accessible ICE actions`, async () => {
      const messages: unknown = await Bun.file(`src/i18n/locales/${locale}.json`).json();
      for (const fieldId of addedFieldIds.filter(
        (id) => id !== 'routingSessionAffinitySubagents'
      )) {
        const entry = CONFIG_FIELD_SEARCH_INDEX.find((item) => item.fieldId === fieldId);
        expect(entry).toBeDefined();
        expect(entry?.labelKey).toBe(`config_management.visual.additions.${fieldId}.label`);
        expect(entry?.hintKey).toBe(`config_management.visual.additions.${fieldId}.hint`);
        expect(resolveKey(messages, entry!.labelKey)).toBeString();
        expect(resolveKey(messages, entry!.hintKey!)).toBeString();
      }
      for (const suffix of ['label', 'hint']) {
        expect(
          resolveKey(
            messages,
            `config_management.visual.additions.routingSessionAffinitySubagents.${suffix}`
          )
        ).toBeString();
      }
      for (const key of [
        'priority_title',
        'priority_description',
        'priority_label',
        'preferred',
        'fallback',
        'edit_tiers',
        'strategy_description',
        'rules_description',
      ]) {
        expect(
          resolveKey(messages, `config_management.visual.sections.routing.${key}`)
        ).toBeString();
      }
      for (const tab of ['tab_credentials', 'tab_rules']) {
        expect(resolveKey(messages, `routing.${tab}`)).toBeString();
      }
      expect(
        resolveKey(messages, 'config_management.visual.sections.routing.legend_order')
      ).toBeUndefined();
      for (const key of [
        'oauthTitle',
        'oauthHint',
        'claudeTitle',
        'codexTitle',
        'antigravityTitle',
        'xaiTitle',
        'liveRelayTitle',
        'liveRelayHint',
        'iceAdd',
        'iceRemove',
        'iceURLs',
        'iceUsername',
        'iceCredential',
        'iceServer',
      ]) {
        const text = resolveKey(messages, `config_management.visual.additions.${key}`);
        expect(text).toBeString();
        expect(String(text).trim().length).toBeGreaterThan(0);
      }
    });
  }
});
