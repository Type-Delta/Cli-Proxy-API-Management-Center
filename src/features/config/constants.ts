import type { ComponentType } from 'react';
import {
  IconCode,
  IconKey,
  IconNetwork,
  IconSatellite,
  IconScrollText,
  IconShield,
  IconSlidersHorizontal,
  IconTimer,
  type IconProps,
} from '@/components/ui/icons';
import type { VisualConfigFieldPath } from '@/types/visualConfig';
import type { VisualSectionId } from './searchIndex';

/** Configuration editor mode: visual form or YAML source. */
export type ConfigEditorMode = 'visual' | 'source';

/** Top tabs: Common, which replaces simple mode, plus seven canonical sections. */
export type ConfigTabId = 'common' | VisualSectionId;

export const CONFIG_SECTION_IDS = [
  'connectivity',
  'network',
  'logging',
  'quota',
  'streaming',
  'advanced',
  'payload',
] as const satisfies readonly VisualSectionId[];

export const CONFIG_TAB_IDS: readonly ConfigTabId[] = ['common', ...CONFIG_SECTION_IDS];

/** Section numbers 01 through 07. Common is an alias view and has no number. */
export const SECTION_INDEX_LABELS: Record<VisualSectionId, string> = {
  connectivity: '01',
  network: '02',
  logging: '03',
  quota: '04',
  streaming: '05',
  advanced: '06',
  payload: '07',
};

export const CONFIG_TAB_ICONS: Record<ConfigTabId, ComponentType<IconProps>> = {
  common: IconSlidersHorizontal,
  connectivity: IconKey,
  network: IconNetwork,
  logging: IconScrollText,
  quota: IconTimer,
  streaming: IconSatellite,
  advanced: IconShield,
  payload: IconCode,
};

/** Common fields share their renderers with their canonical sections. */
export const COMMON_FIELD_IDS = [
  'host',
  'port',
  'apiKeys',
  'proxyUrl',
  'debug',
  'loggingToFile',
  'quotaSwitchProject',
  'quotaSwitchPreviewModel',
  'analyticsEnabled',
  'analyticsPath',
  'analyticsQueueCapacity',
  'analyticsBatchSize',
  'analyticsFlushInterval',
  'analyticsHotRetentionDays',
  'analyticsCircuitFailureThreshold',
  'analyticsMaxStorageBytes',
  'analyticsMinFreeBytes',
  'analyticsStorageTimeZone',
  'analyticsStoreCredentialId',
  'analyticsViewerTrustedProxyCidrs',
  'analyticsViewerAllowLoopbackHttp',
] as const;

/**
 * Validation field paths owned by each section, used for tab error badges.
 * Payload validation uses hasPayloadValidationErrors instead of field paths.
 */
export const SECTION_VALIDATION_FIELDS: Record<VisualSectionId, readonly VisualConfigFieldPath[]> =
  {
    connectivity: ['port'],
    network: ['requestRetry', 'maxRetryCredentials', 'maxRetryInterval', 'authAutoRefreshWorkers'],
    logging: [
      'errorLogsMaxFiles',
      'logsMaxTotalSizeMb',
      'redisUsageQueueRetentionSeconds',
      'analyticsPath',
      'analyticsQueueCapacity',
      'analyticsBatchSize',
      'analyticsFlushInterval',
      'analyticsHotRetentionDays',
      'analyticsCircuitFailureThreshold',
      'analyticsMaxStorageBytes',
      'analyticsMinFreeBytes',
      'analyticsStorageTimeZone',
      'analyticsViewerTrustedProxyCidrs',
    ],
    quota: [],
    streaming: [
      'streaming.keepaliveSeconds',
      'streaming.bootstrapRetries',
      'streaming.nonstreamKeepaliveInterval',
    ],
    advanced: [],
    payload: [],
  };

/**
 * Maps field IDs to useVisualConfig dirty-field keys. Streaming uses dotted leaf paths.
 * tests/configFieldParity.test.ts keeps this map, the search index, and rendered JSX in sync.
 */
export const FIELD_VALUE_KEYS: Record<string, readonly string[]> = {
  // ── connectivity ──────────────────────────────────────────────────────────
  host: ['host'],
  port: ['port'],
  authDir: ['authDir'],
  apiKeys: ['apiKeysText', 'apiKeyLabels'],
  tlsEnable: ['tlsEnable'],
  tlsCert: ['tlsCert'],
  tlsKey: ['tlsKey'],
  rmAllowRemote: ['rmAllowRemote'],
  rmDisableControlPanel: ['rmDisableControlPanel'],
  rmDisableAutoUpdatePanel: ['rmDisableAutoUpdatePanel'],
  rmSecretKey: ['rmSecretKey'],
  rmPanelRepo: ['rmPanelRepo'],
  // ── network ───────────────────────────────────────────────────────────────
  proxyUrl: ['proxyUrl'],
  requestRetry: ['requestRetry'],
  maxRetryCredentials: ['maxRetryCredentials'],
  maxRetryInterval: ['maxRetryInterval'],
  authAutoRefreshWorkers: ['authAutoRefreshWorkers'],
  routingStrategy: ['routingStrategy'],
  disableImageGeneration: ['disableImageGeneration'],
  gptImage2BaseModel: ['gptImage2BaseModel'],
  routingSessionAffinityTTL: ['routingSessionAffinityTTL'],
  forceModelPrefix: ['forceModelPrefix'],
  passthroughHeaders: ['passthroughHeaders'],
  disableCooling: ['disableCooling'],
  routingSessionAffinity: ['routingSessionAffinity'],
  wsAuth: ['wsAuth'],
  // ── logging ───────────────────────────────────────────────────────────────
  debug: ['debug'],
  commercialMode: ['commercialMode'],
  loggingToFile: ['loggingToFile'],
  logsMaxTotalSizeMb: ['logsMaxTotalSizeMb'],
  errorLogsMaxFiles: ['errorLogsMaxFiles'],
  redisUsageQueueRetentionSeconds: ['redisUsageQueueRetentionSeconds'],
  usageStatisticsEnabled: ['usageStatisticsEnabled'],
  analyticsEnabled: ['analyticsEnabled'],
  analyticsPath: ['analyticsPath'],
  analyticsQueueCapacity: ['analyticsQueueCapacity'],
  analyticsBatchSize: ['analyticsBatchSize'],
  analyticsFlushInterval: ['analyticsFlushInterval'],
  analyticsHotRetentionDays: ['analyticsHotRetentionDays'],
  analyticsCircuitFailureThreshold: ['analyticsCircuitFailureThreshold'],
  analyticsMaxStorageBytes: ['analyticsMaxStorageBytes'],
  analyticsMinFreeBytes: ['analyticsMinFreeBytes'],
  analyticsStorageTimeZone: ['analyticsStorageTimeZone'],
  analyticsStoreCredentialId: ['analyticsStoreCredentialId'],
  analyticsViewerTrustedProxyCidrs: ['analyticsViewerTrustedProxyCidrs'],
  analyticsViewerAllowLoopbackHttp: ['analyticsViewerAllowLoopbackHttp'],
  // ── quota ─────────────────────────────────────────────────────────────────
  quotaSwitchProject: ['quotaSwitchProject'],
  quotaSwitchPreviewModel: ['quotaSwitchPreviewModel'],
  quotaAntigravityCredits: ['quotaAntigravityCredits'],
  // ── streaming ─────────────────────────────────────────────────────────────
  streamingKeepaliveSeconds: ['streaming.keepaliveSeconds'],
  streamingBootstrapRetries: ['streaming.bootstrapRetries'],
  streamingNonstreamKeepalive: ['streaming.nonstreamKeepaliveInterval'],
  // ── advanced ──────────────────────────────────────────────────────────────
  pluginsEnabled: ['pluginsEnabled'],
  pluginStoreSources: ['pluginStoreSources'],
  pluginStoreAuth: ['pluginStoreAuth'],
  antigravitySignatureCacheEnabled: ['antigravitySignatureCacheEnabled'],
  antigravitySignatureBypassStrict: ['antigravitySignatureBypassStrict'],
  claudeHeaderUserAgent: ['claudeHeaderUserAgent'],
  claudeHeaderPackageVersion: ['claudeHeaderPackageVersion'],
  claudeHeaderRuntimeVersion: ['claudeHeaderRuntimeVersion'],
  claudeHeaderOs: ['claudeHeaderOs'],
  claudeHeaderArch: ['claudeHeaderArch'],
  claudeHeaderTimeout: ['claudeHeaderTimeout'],
  claudeHeaderStabilizeDeviceProfile: ['claudeHeaderStabilizeDeviceProfile'],
  codexHeaderUserAgent: ['codexHeaderUserAgent'],
  codexHeaderBetaFeatures: ['codexHeaderBetaFeatures'],
  // ── payload ───────────────────────────────────────────────────────────────
  payloadDefaultRules: ['payloadDefaultRules'],
  payloadDefaultRawRules: ['payloadDefaultRawRules'],
  payloadOverrideRules: ['payloadOverrideRules'],
  payloadOverrideRawRules: ['payloadOverrideRawRules'],
  payloadFilterRules: ['payloadFilterRules'],
};

/** Shared DOM IDs keep each tab and tabpanel ARIA relationship aligned. */
export const configTabDomId = (id: ConfigTabId) => `config-tab-${id}`;
export const configPanelDomId = (id: ConfigTabId) => `config-panel-${id}`;

/** localStorage keys for the editor mode and active section. */
export const CONFIG_MODE_STORAGE_KEY = 'config-management:tab';
export const CONFIG_SECTION_STORAGE_KEY = 'config-management:section';
/** Removed simple/full mode key, cleared on mount for migration. */
export const LEGACY_EDITOR_MODE_STORAGE_KEY = 'config-management:editor-mode';
