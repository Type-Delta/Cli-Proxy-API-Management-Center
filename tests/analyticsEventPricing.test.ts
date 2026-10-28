import { beforeAll, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { AnalyticsEvent } from '@/types';
import { errorPayloadFormat } from '@/features/analytics/views/events/eventDiagnostics';
import { clientSessionId } from '@/features/analytics/views/events/sessionIdentity';
import { PricingBreakdown } from '@/features/analytics/views/events/EventDetailParts';
import { parseAnalyticsUrlState, serializeAnalyticsUrlState } from '@/features/analytics/query';
import { analyticsQueryTransport, encodeAnalyticsQuery } from '@/services/api/analytics';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
const render = (event: Partial<AnalyticsEvent>) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(PricingBreakdown, { event: event as AnalyticsEvent })
    )
  );

test('renders stored token prices, costs and applied tier ratios', () => {
  const html = render({
    known_cost_usd: '0.00042',
    pricing_breakdown: {
      input: { tokens: 70, rate_per_million_usd: '2', cost_usd: '0.00014' },
      output: { tokens: 20, rate_per_million_usd: '8', cost_usd: '0.00016' },
      cache_read: { tokens: 10, rate_per_million_usd: '1/5', cost_usd: '0.00002' },
      cache_write: { tokens: 20, rate_per_million_usd: '5', cost_usd: '0.0001' },
      input_tier_multiplier: '2',
      output_tier_multiplier: '2',
      service_tier: 'priority',
    },
  });
  for (const label of [
    'Uncached input',
    'Output',
    'Cache read',
    'Cache write',
    'Rate / 1M',
    'Tokens',
    'Total cost',
  ])
    expect(html).toContain(label);
  expect(html).toContain('0.00042 USD');
  expect(html).toContain('×2 input &amp; output');
  expect(html).toContain('scope="row">Uncached input');
  expect(html).toContain('>70</td>');
  expect(html).toContain('title="0.00014 USD"');
  expect(html).toContain('<tfoot>');
  expect(html.match(/Total cost/g)).toHaveLength(1);
  expect(html).not.toContain('Not recorded');
});

test('credit pricing displays reported credits and stored credit rate without token rates', () => {
  const html = render({
    provider: 'kiro',
    provider_credits: '1.25',
    price_usd_per_credit: '0.03',
    price_source: 'kiro-credits',
    known_cost_usd: '0.0375',
  });
  for (const value of ['Credits used', '1.25', '$0.03', '0.0375 USD'])
    expect(html).toContain(value);
  expect(html).not.toContain('Uncached input');
  expect(html).not.toContain('Input cost');
});

test('historic token costs have no invented rates or breakdown', () => {
  const html = render({ known_cost_usd: '0.0042' });
  expect(html).toContain('Pricing details');
  expect(html).toContain('Not recorded');
  expect(html).toContain('$0.0042');
  expect(html).not.toContain('<table');
});

test('session filter round trips and serializes into the backend event query', () => {
  const state = parseAnalyticsUrlState('?session_id=b2-session');
  expect(state.eventFilters.sessionId).toBe('b2-session');
  expect(serializeAnalyticsUrlState(state)).toContain('session_id=b2-session');
  const request = {
    schema_version: 2 as const,
    operation: 'events' as const,
    start: '2026-10-01T00:00:00Z',
    end: '2026-10-02T00:00:00Z',
    time_zone: 'UTC',
    filters: { session_id: [state.eventFilters.sessionId] },
  };
  expect(analyticsQueryTransport(request)).toBe('GET');
  const encoded = encodeAnalyticsQuery(request).replace(/-/g, '+').replace(/_/g, '/');
  expect(JSON.parse(atob(encoded)).filters).toEqual({ session_id: ['b2-session'] });
});

test('client session display omits internal derived identities', () => {
  for (const session_id of ['derived:ctx:v1:digest', 'ctx:v1:digest', 'lcp:v1:digest']) {
    expect(clientSessionId({ session_id })).toBeNull();
    expect(clientSessionId({ session_id, session_source: 'derived' })).toBeNull();
  }
  expect(clientSessionId({ session_id: 'client-uuid', session_source: 'codex' })).toBe(
    'client-uuid'
  );
  expect(
    clientSessionId({ session_id: 'derived:ctx:v1:client-literal', session_source: 'header' })
  ).toBe('derived:ctx:v1:client-literal');
  expect(clientSessionId({})).toBeNull();
});

test('zero-token pricing components show empty costs, not fake zero-dollar charges', () => {
  const component = { tokens: 0, rate_per_million_usd: '4', cost_usd: '0' };
  const html = render({
    known_cost_usd: '0',
    pricing_breakdown: {
      input: component,
      output: component,
      cache_read: component,
      cache_write: component,
      input_tier_multiplier: '2',
      output_tier_multiplier: '3',
      service_tier: 'priority',
    },
  });
  expect(html.match(/<td>—<\/td>/g)).toHaveLength(4);
  expect(html.match(/title="4 USD"/g)).toHaveLength(4);
  expect(html).toContain('×2 input');
  expect(html).toContain('×3 output');
  expect(html).toContain('title="0 USD"');
});

test('error highlighting requires valid JSON', () => {
  expect(errorPayloadFormat('{"error":"bad"}')).toEqual({ language: 'json' });
  expect(errorPayloadFormat('write tcp 127.0.0.1:1234: broken pipe')).toEqual({
    language: 'text',
    tone: 'error',
  });
});
