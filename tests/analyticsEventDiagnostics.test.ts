import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { EventDetailSheet } from '@/features/analytics/views/events/EventDetailSheet';
import { EventTimingGraph } from '@/features/analytics/views/events/EventTimingGraph';
import type { AnalyticsEvent } from '@/types';
import {
  buildEventTimeline,
  buildEventTiming,
  eventFailureHop,
  formatUpstreamTarget,
  hasHopInstrumentation,
  normalizeRawUsage,
  tokenizeJson,
  type EventStep,
  type EventStepId,
  type EventStepState,
} from '@/features/analytics/views/events/eventDiagnostics';

// Minimal legacy-shaped event: only fields the original schema recorded. Individual tests layer the
// hop instrumentation they exercise on top so each scenario reads as a single explicit delta.
const makeEvent = (overrides: Partial<AnalyticsEvent> = {}) =>
  ({
    schema_version: 1,
    succeeded: true,
    requested_at: '2026-09-09T10:00:00.500Z',
    provider: 'openai',
    endpoint_class: 'chat_completions',
    upstream_status_code: null,
    error_class: null,
    latency_ms: 2_000,
    time_to_first_token_ms: 300,
    generation_time_ms: 1_500,
    tokens: { output: 150 },
    ...overrides,
  }) as AnalyticsEvent;

const fullyInstrumented = (overrides: Partial<AnalyticsEvent> = {}) =>
  makeEvent({
    client_method: 'POST',
    client_path: '/v1/chat/completions',
    received_at: '2026-09-09T10:00:00.000Z',
    upstream_method: 'POST',
    upstream_url: 'https://api.openai.com/v1/chat/completions',
    upstream_sent_at: '2026-09-09T10:00:00.200Z',
    routing_time_ms: 200,
    provider_latency_ms: 100,
    first_token_latency_ms: 300,
    responded_at: '2026-09-09T10:00:02.000Z',
    upstream_status_code: 200,
    proxy_status_code: 200,
    upstream_usage_raw: { total_tokens: 150, completion_tokens: 150 },
    ...overrides,
  });

const stateById = (steps: readonly EventStep[]): Record<EventStepId, EventStepState> =>
  steps.reduce(
    (acc, step) => {
      acc[step.id] = step.state;
      return acc;
    },
    {} as Record<EventStepId, EventStepState>
  );

describe('buildEventTimeline failure point', () => {
  test('success with every hop field marks all four nodes complete', () => {
    const steps = buildEventTimeline(fullyInstrumented());
    expect(stateById(steps)).toEqual({
      client_request: 'complete',
      cpa_dispatch: 'complete',
      provider: 'complete',
      cpa_response: 'complete',
    });
    expect(steps.at(-1)?.at).toBe('2026-09-09T10:00:02.000Z');
    expect(steps.at(-1)?.summary).toMatchObject({ kind: 'proxy_result', status: 200 });
    expect(eventFailureHop(steps)).toBeNull();
  });

  test('provider 429 fails at the provider node and skips the return hops', () => {
    const steps = buildEventTimeline(
      fullyInstrumented({
        succeeded: false,
        upstream_status_code: 429,
        proxy_status_code: 429,
        error_class: 'rate_limited',
        upstream_error_body: '{"error":{"type":"rate_limit_exceeded"}}',
      })
    );
    expect(stateById(steps)).toEqual({
      client_request: 'complete',
      cpa_dispatch: 'complete',
      provider: 'failed',
      cpa_response: 'skipped',
    });
    expect(steps.at(-1)?.summary).toMatchObject({ kind: 'proxy_result', status: 429 });
    expect(eventFailureHop(steps)).toBe('provider_to_cpa');
  });

  test('CPA-side failure before dispatch fails at the CPA node', () => {
    const steps = buildEventTimeline(
      makeEvent({
        succeeded: false,
        client_method: 'POST',
        client_path: '/v1/messages',
        received_at: '2026-09-09T10:00:00.000Z',
        upstream_sent_at: null,
        upstream_status_code: null,
        proxy_status_code: 500,
        proxy_error: 'no healthy upstream credential',
        error_class: 'internal',
        time_to_first_token_ms: null,
        generation_time_ms: null,
      })
    );
    expect(stateById(steps)).toEqual({
      client_request: 'complete',
      cpa_dispatch: 'failed',
      provider: 'skipped',
      cpa_response: 'skipped',
    });
    expect(eventFailureHop(steps)).toBe('cpa_to_provider');
  });

  test('mid-stream failure after a 200 blames CPA, not the provider', () => {
    const steps = buildEventTimeline(
      fullyInstrumented({
        succeeded: false,
        upstream_status_code: 200,
        proxy_status_code: 200,
        proxy_error: 'stream aborted before completion',
        responded_at: null,
      })
    );
    expect(stateById(steps)).toEqual({
      client_request: 'complete',
      cpa_dispatch: 'complete',
      provider: 'complete',
      cpa_response: 'failed',
    });
    expect(eventFailureHop(steps)).toBe('cpa_to_client');
  });

  test('legacy event never invents a failure and does not add a client delivery step', () => {
    const event = makeEvent();
    expect(hasHopInstrumentation(event)).toBe(false);
    const steps = buildEventTimeline(event);
    const states = stateById(steps);
    expect(Object.values(states)).not.toContain('failed');
    expect(states.client_request).toBe('complete');
    expect(states.provider).toBe('complete');
    expect(steps.map((step) => step.id)).toEqual([
      'client_request',
      'cpa_dispatch',
      'provider',
      'cpa_response',
    ]);
    expect(eventFailureHop(steps)).toBeNull();
  });
});

describe('buildEventTiming', () => {
  test('derives routing, provider ACK, post-ACK waiting, generation, total and throughput', () => {
    const timing = buildEventTiming(fullyInstrumented());
    const rows = Object.fromEntries(timing.rows.map((row) => [row.id, row.durationMs]));
    expect(rows.routing).toBe(200);
    expect(rows.provider).toBe(100);
    expect(rows.waiting).toBe(200);
    expect(rows.generation).toBe(1_500);
    expect(timing.rows.find((row) => row.id === 'generation')?.startMs).toBe(500);
    expect(timing.totalMs).toBe(2_000);
    expect(timing.scaleMs).toBe(2_000);
    expect(timing.throughput).toEqual({ tokens: 150, tokensPerSecond: 100, estimated: false });
  });

  test('marks unrecorded segments null instead of back-filling remaining time', () => {
    const timing = buildEventTiming(
      makeEvent({
        succeeded: false,
        proxy_status_code: 500,
        proxy_error: 'boom',
        client_method: 'POST',
        upstream_sent_at: null,
        time_to_first_token_ms: null,
        generation_time_ms: null,
        latency_ms: 40,
      })
    );
    const rows = Object.fromEntries(timing.rows.map((row) => [row.id, row]));
    expect(rows.routing.durationMs).toBeNull();
    expect(rows.routing.startMs).toBeNull();
    expect(rows.provider.durationMs).toBeNull();
    expect(rows.generation.durationMs).toBeNull();
    expect(timing.totalMs).toBe(40);
    expect(timing.throughput).toBeNull();
  });

  test('uses the latency minus TTFT estimate when generation is missing', () => {
    const timing = buildEventTiming(
      makeEvent({ generation_time_ms: null, time_to_first_token_ms: 400, latency_ms: 1_000 })
    );
    expect(timing.throughput).toEqual({ tokens: 150, tokensPerSecond: 250, estimated: true });
  });

  test('marks estimated chart throughput explicitly when generation is missing', () => {
    const timing = buildEventTiming(
      makeEvent({ generation_time_ms: null, time_to_first_token_ms: 400, latency_ms: 1_000 })
    );
    const html = renderToStaticMarkup(
      createElement(EventTimingGraph, {
        timing,
        providerLabel: 'Codex',
        providerStatus: 200,
        providerFailed: false,
      })
    );

    expect(html).toContain('Estimated');
  });

  test('legacy event without hop stamps reports routing as not recorded', () => {
    const timing = buildEventTiming(makeEvent());
    expect(timing.rows.find((row) => row.id === 'routing')?.durationMs).toBeNull();
    expect(timing.rows.find((row) => row.id === 'provider')?.durationMs).toBeNull();
    expect(timing.rows.find((row) => row.id === 'waiting')?.durationMs).toBeNull();
    expect(timing.rows.find((row) => row.id === 'generation')?.startMs).toBeNull();
    expect(timing.totalMs).toBe(2_000);
  });

  test('keeps zero length measured boundaries instead of treating them as missing', () => {
    const timing = buildEventTiming(
      fullyInstrumented({
        routing_time_ms: 0,
        provider_latency_ms: 0,
        first_token_latency_ms: 0,
        generation_time_ms: 0,
      })
    );
    expect(timing.rows.map((row) => row.durationMs)).toEqual([0, 0, 0, 0]);
    expect(timing.rows.find((row) => row.id === 'generation')?.startMs).toBe(200);
  });

  test('does not render an inconsistent post-ACK interval', () => {
    const timing = buildEventTiming(
      fullyInstrumented({
        provider_latency_ms: 300,
        first_token_latency_ms: 200,
        generation_time_ms: 400,
      })
    );
    expect(timing.rows.find((row) => row.id === 'waiting')?.durationMs).toBeNull();
    expect(timing.rows.find((row) => row.id === 'waiting')?.startMs).toBeNull();
    expect(timing.rows.find((row) => row.id === 'generation')?.startMs).toBeNull();
  });

  test('anchors provider phases at the current dispatch after a retry gap', () => {
    const timing = buildEventTiming(
      fullyInstrumented({
        upstream_sent_at: '2026-09-09T10:00:00.400Z',
        routing_time_ms: 200,
        provider_latency_ms: 100,
        first_token_latency_ms: 300,
      })
    );
    expect(timing.rows.find((row) => row.id === 'routing')).toMatchObject({
      startMs: 0,
      durationMs: 200,
    });
    expect(timing.rows.find((row) => row.id === 'provider')).toMatchObject({
      startMs: 400,
      durationMs: 100,
    });
    expect(timing.rows.find((row) => row.id === 'waiting')).toMatchObject({
      startMs: 500,
      durationMs: 200,
    });
    expect(timing.rows.find((row) => row.id === 'generation')?.startMs).toBe(700);
  });
});

test('timing total includes routing before the attempt starts', () => {
  const timing = buildEventTiming(
    fullyInstrumented({
      requested_at: '2026-09-09T10:00:01.000Z',
      upstream_sent_at: '2026-09-09T10:00:01.000Z',
      responded_at: '2026-09-09T10:00:03.000Z',
      latency_ms: 2_000,
    })
  );
  expect(timing.totalMs).toBe(3_000);
});

test('backend raw usage field counts as hop instrumentation', () => {
  const event = makeEvent({ upstream_usage_raw: { total_tokens: 150 } });
  expect(hasHopInstrumentation(event)).toBe(true);
  expect(normalizeRawUsage(event.upstream_usage_raw)).toContain('150');
});

describe('raw payload helpers', () => {
  test('normalizeRawUsage pretty-prints objects and JSON-encoded strings alike', () => {
    expect(normalizeRawUsage({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(normalizeRawUsage('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(normalizeRawUsage('  not json  ')).toBe('not json');
    expect(normalizeRawUsage(null)).toBeNull();
    expect(normalizeRawUsage('   ')).toBeNull();
  });

  test('tokenizeJson round-trips its input and classifies keys, strings and numbers', () => {
    const source = '{"n": 12, "s": "x", "b": true}';
    const tokens = tokenizeJson(source);
    expect(tokens.map((token) => token.value).join('')).toBe(source);
    const typed = (value: string) => tokens.find((token) => token.value === value)?.type;
    expect(typed('"n":')).toBe('key');
    expect(typed('12')).toBe('number');
    expect(typed('"x"')).toBe('string');
    expect(typed('true')).toBe('keyword');
  });

  test('formatUpstreamTarget strips scheme and trailing slashes', () => {
    expect(formatUpstreamTarget('https://api.anthropic.com/v1/messages/')).toBe(
      'api.anthropic.com/v1/messages'
    );
    expect(formatUpstreamTarget(null)).toBeNull();
  });
});


beforeAll(async () => { await i18n.changeLanguage('en'); });

test('timing durations stay visible when their timeline position is unavailable', () => {
  const timing = buildEventTiming(makeEvent({
    routing_time_ms: null,
    upstream_sent_at: null,
    provider_latency_ms: 120,
    first_token_latency_ms: 350,
    generation_time_ms: 500,
  }));
  const html = renderToStaticMarkup(createElement(EventTimingGraph, {
    timing,
    providerLabel: 'Codex',
    providerStatus: 200,
    providerFailed: false,
  }));
  expect(html).toContain('120 ms</span>');
  expect(html).toContain('230 ms</span>');
  expect(html).toContain('500 ms</span>');
  expect(timing.rows.find((row) => row.id === 'provider')?.startMs).toBeNull();
});

test('event details prefer the credential filename over the privacy ID', () => {
  const credentialID = 'a'.repeat(64);
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(EventDetailSheet, {
        open: true,
        event: fullyInstrumented({
          attempt_id: 'b'.repeat(32),
          proxy_request_id: 'c'.repeat(32),
          credential_id: credentialID,
          credential_filename: 'codex-account.json',
          model: 'gpt-5',
          tokens: {
            input: 100,
            output: 50,
            reasoning: 0,
            cached: 0,
            cache_read: 0,
            cache_creation: 0,
            total: 150,
            schema: 'normalized-v1',
            quality: 'exact',
          },
        }),
        loading: false,
        error: '',
        keyIdentity: 'test-key',
        onClose: () => {},
        onRetry: () => {},
      })
    )
  );

  expect(html).toContain('codex-account.json');
  expect(html).not.toContain(`${credentialID.slice(0, 8)}…${credentialID.slice(-6)}`);
});

test('event details distinguish strict latency, provider latency, and E2E latency', () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(EventDetailSheet, {
        open: true,
        event: fullyInstrumented({
          first_token_latency_ms: 0,
          provider_latency_ms: 120,
          latency_ms: 2_000,
        }),
        loading: false,
        error: '',
        keyIdentity: 'test-key',
        onClose: () => {},
        onRetry: () => {},
      })
    )
  );

  expect(html).toContain('Latency');
  expect(html).toContain('Provider latency');
  expect(html).toContain('E2E latency');
  expect(html).toContain('0 ms');
  expect(html).toContain('120 ms');
  expect(html).toContain('2 s');
  expect(html).toContain(
    'title="Time from dispatch until the first substantive token reaches CPA."'
  );
  expect(html).toContain(
    'title="Time from dispatch until HTTP headers arrive or the first request-specific WebSocket response frame, including provider and network wait."'
  );
});

test('event details show unavailable for missing strict latency measurements', () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(EventDetailSheet, {
        open: true,
        event: fullyInstrumented({
          first_token_latency_ms: null,
          provider_latency_ms: null,
        }),
        loading: false,
        error: '',
        keyIdentity: 'test-key',
        onClose: () => {},
        onRetry: () => {},
      })
    )
  );

  expect(html).toContain('Not recorded');
});

test('event details show the unclassified token remainder, including zero', () => {
  const render = (tokens: AnalyticsEvent['tokens'], provider = 'claude') =>
    renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(EventDetailSheet, {
          open: true,
          event: fullyInstrumented({ provider, tokens }),
          loading: false,
          error: '',
          keyIdentity: 'test-key',
          onClose: () => {},
          onRetry: () => {},
        })
      )
    );

  const claudePartialUsage = render({
    input: 10,
    output: 0,
    reasoning: 0,
    cached: 0,
    cache_read: 0,
    cache_creation: 0,
    total: 15,
    accounting_schema: 'normalized-v1',
    quality: 'missing',
  });
  expect(claudePartialUsage).toMatch(/Unclassified<\/dt><dd[^>]*><span[^>]*>5<\/span>/);

  const fullyClassified = render({
    input: 40,
    output: 60,
    reasoning: 0,
    cached: 0,
    cache_read: 0,
    cache_creation: 0,
    total: 100,
    accounting_schema: 'normalized-v1',
    quality: 'exact',
  });
  expect(fullyClassified).toMatch(/Unclassified<\/dt><dd[^>]*><span[^>]*>0<\/span>/);
});
