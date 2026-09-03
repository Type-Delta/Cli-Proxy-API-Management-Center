import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsyncState } from '@/features/analytics/components/AnalyticsShared';
import i18n from '@/i18n';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('analytics retry wiring', () => {
  test('passes retry metadata through the owned view call sites', () => {
    const files = [
      'views/Overview.tsx',
      'views/KeysView.tsx',
      'views/Events.tsx',
      'views/Pricing.tsx',
      'ViewerPage.tsx',
    ];
    const source = files
      .map((file) =>
        readFileSync(resolve(import.meta.dir, '../src/features/analytics', file), 'utf8')
      )
      .join('\n');
    expect(source.match(/(?:errorStatus|retryAt)=/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  test('disables retry while a future Retry-After deadline is active', () => {
    const markup = renderToStaticMarkup(
      createElement(AsyncState, {
        loading: false,
        error: 'Request failed',
        errorStatus: 429,
        retryAt: Date.now() + 30_000,
        onRetry: () => {},
        children: null,
      })
    );
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Retry in');
  });
});
