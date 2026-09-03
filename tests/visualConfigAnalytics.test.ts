import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { getVisualConfigValidationErrors, useVisualConfig } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '../src/types/visualConfig';

const analyticsYaml = `analytics:
  enabled: true
  path: /var/lib/cpa/analytics.db
  queue-capacity: 4096
  batch-size: 128
  flush-interval: 500ms
  hot-retention-days: 45
  circuit-failure-threshold: 7
  max-storage-bytes: 9223372036854775807
  min-free-bytes: 268435456
  privacy:
    store-credential-id: false
  viewer:
    trusted-proxy-cidrs:
      - 10.20.0.0/16
    allow-loopback-http: true
  future-option: keep-me
`;

describe('visual analytics configuration', () => {
  test('loads every analytics field from YAML', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [loaded, setLoaded] = useState(false);

      if (!loaded) {
        visualConfig.loadVisualValuesFromYaml(analyticsYaml);
        setLoaded(true);
        return null;
      }

      const values = visualConfig.visualValues;
      return createElement(
        'pre',
        null,
        encodeURIComponent(
          JSON.stringify({
            enabled: values.analyticsEnabled,
            path: values.analyticsPath,
            queueCapacity: values.analyticsQueueCapacity,
            batchSize: values.analyticsBatchSize,
            flushInterval: values.analyticsFlushInterval,
            hotRetentionDays: values.analyticsHotRetentionDays,
            circuitFailureThreshold: values.analyticsCircuitFailureThreshold,
            maxStorageBytes: values.analyticsMaxStorageBytes,
            minFreeBytes: values.analyticsMinFreeBytes,
            storeCredentialId: values.analyticsStoreCredentialId,
            viewerTrustedProxyCidrs: values.analyticsViewerTrustedProxyCidrs,
            viewerAllowLoopbackHttp: values.analyticsViewerAllowLoopbackHttp,
          })
        )
      );
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const values = JSON.parse(decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length)));

    expect(values).toEqual({
      enabled: true,
      path: '/var/lib/cpa/analytics.db',
      queueCapacity: '4096',
      batchSize: '128',
      flushInterval: '500ms',
      hotRetentionDays: '45',
      circuitFailureThreshold: '7',
      maxStorageBytes: '9223372036854775807',
      minFreeBytes: '268435456',
      storeCredentialId: false,
      viewerTrustedProxyCidrs: ['10.20.0.0/16'],
      viewerAllowLoopbackHttp: true,
    });
  });

  test('writes dirty analytics fields without flattening unknown YAML', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(analyticsYaml);
        setPhase(1);
        return null;
      }
      if (phase === 1) {
        visualConfig.setVisualValues({
          analyticsEnabled: false,
          analyticsPath: '',
          analyticsQueueCapacity: '8192',
          analyticsBatchSize: '256',
          analyticsFlushInterval: '250ms',
          analyticsHotRetentionDays: '90',
          analyticsCircuitFailureThreshold: '5',
          analyticsMaxStorageBytes: '5368709120',
          analyticsMinFreeBytes: '536870912',
          analyticsStorageTimeZone: ' Local ',
          analyticsStoreCredentialId: true,
          analyticsViewerTrustedProxyCidrs: ['172.30.0.0/24'],
          analyticsViewerAllowLoopbackHttp: false,
        });
        setPhase(2);
        return null;
      }

      return createElement(
        'pre',
        null,
        encodeURIComponent(visualConfig.applyVisualChangesToYaml(analyticsYaml))
      );
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const result = parseYaml(decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length)));

    expect(result.analytics).toEqual({
      enabled: false,
      path: '',
      'queue-capacity': 8192,
      'batch-size': 256,
      'flush-interval': '250ms',
      'hot-retention-days': 90,
      'circuit-failure-threshold': 5,
      'max-storage-bytes': 5368709120,
      'min-free-bytes': 536870912,
      'storage-time-zone': 'Local',
      privacy: { 'store-credential-id': true },
      viewer: {
        'trusted-proxy-cidrs': ['172.30.0.0/24'],
        'allow-loopback-http': false,
      },
      'future-option': 'keep-me',
    });
  });

  test('preserves the full int64 storage range', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(analyticsYaml);
        setPhase(1);
        return null;
      }
      if (phase === 1) {
        visualConfig.setVisualValues({ analyticsMaxStorageBytes: '9223372036854775806' });
        setPhase(2);
        return null;
      }

      return createElement(
        'pre',
        null,
        encodeURIComponent(visualConfig.applyVisualChangesToYaml(analyticsYaml))
      );
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const output = decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length));
    expect(output).toContain('max-storage-bytes: 9223372036854775806');
  });

  test('accepts every zone Go time.LoadLocation accepts, including aliases and UTC', () => {
    for (const zone of [
      'UTC',
      'Asia/Kolkata',
      'Asia/Calcutta',
      'Europe/Kyiv',
      'America/St_Johns',
      'Local',
    ]) {
      const errors = getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        analyticsStorageTimeZone: zone,
      });
      expect(errors.analyticsStorageTimeZone).toBeUndefined();
    }
    for (const zone of ['', '   ', 'Not/AZone', 'GMT+7 ish']) {
      const errors = getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        analyticsStorageTimeZone: zone,
      });
      expect(errors.analyticsStorageTimeZone).toBe('analytics_storage_time_zone_invalid');
    }
  });

  test('matches CPA validation for storage bytes and trusted proxy CIDRs', () => {
    const valid = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsMaxStorageBytes: '9223372036854775807',
      analyticsViewerTrustedProxyCidrs: ['10.20.0.0/16', '2001:db8::/32'],
    });
    expect(valid.analyticsMaxStorageBytes).toBeUndefined();
    expect(valid.analyticsViewerTrustedProxyCidrs).toBeUndefined();

    const invalidStorage = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsMaxStorageBytes: '9223372036854775808',
    });
    expect(invalidStorage.analyticsMaxStorageBytes).toBe('analytics_storage_bytes_range');

    const missingStorage = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsMinFreeBytes: '',
    });
    expect(missingStorage.analyticsMinFreeBytes).toBe('analytics_storage_bytes_range');

    const hostBits = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsViewerTrustedProxyCidrs: ['10.20.0.1/16'],
    });
    expect(hostBits.analyticsViewerTrustedProxyCidrs).toBe('analytics_proxy_cidrs_invalid');

    const leadingZeroPrefix = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsViewerTrustedProxyCidrs: ['10.20.0.0/016'],
    });
    expect(leadingZeroPrefix.analyticsViewerTrustedProxyCidrs).toBe(
      'analytics_proxy_cidrs_invalid'
    );

    const duplicates = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      analyticsViewerTrustedProxyCidrs: ['2001:db8::/32', '2001:0DB8::/32'],
    });
    expect(duplicates.analyticsViewerTrustedProxyCidrs).toBe('analytics_proxy_cidrs_invalid');
  });

  test('normalizes CRLF before serializing comments', () => {
    const source = [
      '# root one',
      '# root two',
      'host: old',
      'section:',
      '  # child one',
      '  # child two',
      '  key: value',
      '',
    ].join('\r\n');

    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(source);
        setPhase(1);
        return null;
      }
      if (phase === 1) {
        visualConfig.setVisualValues({ host: 'new' });
        setPhase(2);
        return null;
      }

      return createElement(
        'pre',
        null,
        encodeURIComponent(visualConfig.applyVisualChangesToYaml(source))
      );
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const output = decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length));
    expect(output).not.toContain('\r');
    expect(output).toContain('# root one\n# root two\nhost: new');
    expect(output).toContain('  # child one\n  # child two\n  key: value');
  });
});
