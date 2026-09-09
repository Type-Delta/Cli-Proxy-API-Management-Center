import { describe, expect, test } from 'bun:test';
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
  test('derives routing, provider, generation, total and throughput on one scale', () => {
    const timing = buildEventTiming(fullyInstrumented());
    const rows = Object.fromEntries(timing.rows.map((row) => [row.id, row.durationMs]));
    expect(rows.routing).toBe(200);
    expect(rows.provider).toBe(300);
    expect(rows.generation).toBe(1_500);
    expect(timing.totalMs).toBe(2_000);
    expect(timing.scaleMs).toBe(2_000);
    expect(timing.throughput).toEqual({ tokens: 150, tokensPerSecond: 100 });
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

  test('legacy event without hop stamps reports routing as not recorded', () => {
    const timing = buildEventTiming(makeEvent());
    const routing = timing.rows.find((row) => row.id === 'routing');
    expect(routing?.durationMs).toBeNull();
    expect(timing.totalMs).toBe(2_000);
  });
});

test('timing total includes routing before the attempt starts', () => {
  const timing = buildEventTiming(fullyInstrumented({
    requested_at: '2026-09-09T10:00:01.000Z',
    upstream_sent_at: '2026-09-09T10:00:01.000Z',
    responded_at: '2026-09-09T10:00:03.000Z',
    latency_ms: 2_000,
  }));
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
