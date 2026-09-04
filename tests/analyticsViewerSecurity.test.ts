import { describe, expect, test } from 'bun:test';
import {
  consumeViewerCredential,
  exchangeViewerCredential,
  isViewerApiOriginTrusted,
  readViewerTrustedOrigins,
  trustViewerApiOrigin,
} from '@/features/analytics/viewerSecurity';
import {
  buildViewerLink,
  buildViewerURL,
  resolveViewerApiBase,
  viewerCredentialsMode,
} from '@/features/analytics/views/viewer/viewerApi';
import { apiClient } from '@/services/api/client';

describe('analytics viewer URLs', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
  };

  test('uses the configured API origin for viewer requests', () => {
    apiClient.setConfig({ apiBase: 'https://api.example.test', managementKey: '' });

    expect(buildViewerURL('session')).toBe('https://api.example.test/v0/analytics/viewer/session');
    expect(buildViewerURL('/summary')).toBe('https://api.example.test/v0/analytics/viewer/summary');
  });

  test('omits the API origin for same-origin links', () => {
    expect(
      buildViewerLink(
        'credential',
        'https://console.example.test',
        '/management.html',
        'https://console.example.test/v0/management'
      )
    ).toBe('https://console.example.test/management.html#/viewer#credential');
  });

  test('embeds the API origin for cross-origin links', () => {
    expect(
      buildViewerLink(
        'credential',
        'https://console.example.test',
        '/management.html',
        'https://api.example.test/v0/management'
      )
    ).toBe(
      'https://console.example.test/management.html#/viewer?api=https%3A%2F%2Fapi.example.test#credential'
    );
  });

  test('parses and scrubs legacy and API-bearing links', () => {
    const replacements: string[] = [];
    expect(consumeViewerCredential('#/viewer#legacy', (url) => replacements.push(url))).toEqual({
      credential: 'legacy',
      apiBase: '',
    });
    expect(
      consumeViewerCredential('#/viewer?api=https%3A%2F%2Fapi.example.test%3A8443#new', (url) =>
        replacements.push(url)
      )
    ).toEqual({ credential: 'new', apiBase: 'https://api.example.test:8443' });
    expect(replacements).toEqual(['#/viewer', '#/viewer']);
  });

  test('rejects API values that are not bare HTTP origins', () => {
    expect(
      consumeViewerCredential(
        '#/viewer?api=https%3A%2F%2Fuser%3Apass%40api.example.test%2Fpath#credential',
        () => {}
      )
    ).toEqual({ credential: 'credential', apiBase: '' });
    expect(
      consumeViewerCredential('#/viewer?api=http%3A%2F%2Fapi.example.test#credential', () => {})
    ).toEqual({ credential: 'credential', apiBase: '' });
  });

  test('checks viewer origins in page, configured, then trusted-list order', () => {
    const origin = 'https://api.example.test';
    expect(isViewerApiOriginTrusted(origin, { pageOrigin: origin })).toBe(true);
    expect(
      isViewerApiOriginTrusted(origin, { configuredApiOrigin: 'https://api.example.test:443' })
    ).toBe(true);
    expect(isViewerApiOriginTrusted(origin, { trustedOrigins: [origin] })).toBe(true);
    expect(
      isViewerApiOriginTrusted(origin, {
        pageOrigin: 'https://console.example.test',
        configuredApiOrigin: 'https://configured.example.test',
        trustedOrigins: [],
      })
    ).toBe(false);
  });

  test('persists a consented origin without storing credential material', () => {
    const browserStorage = storage();
    trustViewerApiOrigin('https://api.example.test', browserStorage);
    expect(readViewerTrustedOrigins(browserStorage)).toEqual(['https://api.example.test']);
    expect(JSON.stringify(browserStorage)).not.toContain('credential');
  });

  test('does not fetch an untrusted destination before consent', async () => {
    apiClient.setConfig({ apiBase: 'https://configured.example.test', managementKey: '' });
    let requests = 0;
    const request = (async () => {
      requests += 1;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await expect(
      exchangeViewerCredential('credential', request, 'https://untrusted.example.test')
    ).rejects.toThrow('viewer exchange requires consent');
    expect(requests).toBe(0);
  });

  test('fetches after consent and keeps the trusted origin persisted', async () => {
    const browserStorage = storage();
    trustViewerApiOrigin('https://api.example.test', browserStorage);
    apiClient.setConfig({ apiBase: 'https://api.example.test', managementKey: '' });
    let requestedURL = '';
    const request = (async (input: RequestInfo | URL) => {
      requestedURL = String(input);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await exchangeViewerCredential('credential', request, 'https://api.example.test');
    expect(requestedURL).toBe('https://api.example.test/v0/analytics/viewer/session');
    expect(readViewerTrustedOrigins(browserStorage)).toEqual(['https://api.example.test']);
  });

  test('resolves a link API before configured API and relative fallback', () => {
    apiClient.setConfig({ apiBase: 'https://configured.example.test', managementKey: '' });
    expect(resolveViewerApiBase('https://linked.example.test')).toBe('https://linked.example.test');
    expect(resolveViewerApiBase()).toBe('https://configured.example.test');
    expect(buildViewerURL('session', '')).toBe('/v0/analytics/viewer/session');
  });

  test('includes cookies only for a cross-origin API', () => {
    expect(
      viewerCredentialsMode(
        'https://console.example.test/v0/analytics/viewer/session',
        'https://console.example.test'
      )
    ).toBe('same-origin');
    expect(
      viewerCredentialsMode(
        'https://api.example.test/v0/analytics/viewer/session',
        'https://console.example.test'
      )
    ).toBe('include');
  });
});
