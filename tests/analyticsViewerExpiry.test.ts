import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/i18n';
import i18n from '@/i18n';
import { ViewerConsent, ViewerScope } from '@/features/analytics/ViewerPage';
import {
  viewerExpiryTimes,
  type ViewerCapabilities,
} from '@/features/analytics/views/viewer/viewerApi';

const capabilities: ViewerCapabilities = {
  api_schema_version: 1,
  allowed_views: ['summary'],
  expires_at: '2026-09-03T14:01:00Z',
  session_expires_at: '2026-09-03T14:01:00Z',
  view_expires_at: '2026-09-10T13:31:00Z',
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('Viewer expiry', () => {
  test('renders a consent card with the destination and explicit actions', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewerConsent, {
        origin: 'https://api.example.test',
        onContinue: () => {},
        onCancel: () => {},
      })
    );
    expect(markup).toContain('https://api.example.test');
    expect(markup).toContain('Continue');
    expect(markup).toContain('Cancel');
  });

  test('separates the link expiry from the session expiry', () => {
    expect(viewerExpiryTimes(capabilities)).toEqual({
      view: '2026-09-10T13:31:00Z',
      session: '2026-09-03T14:01:00Z',
    });
  });

  test('falls back to expires_at as the session expiry on older CPA builds', () => {
    const legacy: ViewerCapabilities = {
      api_schema_version: 1,
      allowed_views: ['summary'],
      expires_at: '2026-09-03T14:01:00Z',
    };
    expect(viewerExpiryTimes(legacy)).toEqual({
      view: undefined,
      session: '2026-09-03T14:01:00Z',
    });
  });

  test('renders two distinct dated sentences', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewerScope, { capabilities, allowedViews: ['Summary'] })
    );
    expect(markup).toContain('This link is valid until');
    expect(markup).toContain('This session ends at');
    expect(markup).toContain('reopen the link to continue');
    // Both sentences must carry different timestamps, not one repeated value.
    const sentences = markup.split('</p>');
    const linkSentence = sentences.find((part) => part.includes('valid until')) ?? '';
    const sessionSentence = sentences.find((part) => part.includes('session ends at')) ?? '';
    expect(linkSentence).not.toBe('');
    expect(sessionSentence).not.toBe('');
    expect(linkSentence).not.toBe(sessionSentence);
  });

  test('omits the link sentence when CPA does not report a view expiry', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewerScope, {
        capabilities: {
          api_schema_version: 1,
          allowed_views: ['summary'],
          expires_at: '2026-09-03T14:01:00Z',
        },
        allowedViews: ['Summary'],
      })
    );
    expect(markup).not.toContain('This link is valid until');
    expect(markup).toContain('This session ends at');
  });
});
