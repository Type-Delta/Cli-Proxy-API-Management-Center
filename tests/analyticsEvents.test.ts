import { describe, expect, test } from 'bun:test';
import type { AnalyticsEvent } from '@/types';
import {
  eventArrivalRate,
  eventEffectiveOutputRate,
  eventOutputWindow,
  rateReasonKey,
} from '@/features/analytics/views/events/eventDiagnostics';

const makeEvent = (overrides: Partial<AnalyticsEvent> = {}) =>
  ({
    latency_ms: 10_000,
    time_to_first_token_ms: 1_000,
    generation_time_ms: 1_000,
    tokens: { output: 100, quality: 'exact' },
    ...overrides,
  }) as AnalyticsEvent;

const observed = (rate: number, extra: Record<string, unknown> = {}) => ({
  status: 'observed' as const,
  method: 'arrival_window_v1' as const,
  tokens_per_second: rate,
  basis: 'visible_deltas' as const,
  token_quality: 'exact' as const,
  ...extra,
});

describe('analytics event arrival rate', () => {
  test('reads the qualified throughput object, not the compatibility alias', () => {
    const event = makeEvent({
      throughput: observed(750),
      // A stale alias must not override or qualify the explicit observation.
      tokens_per_second: 1,
      speed_estimated: true,
    });

    expect(eventArrivalRate(event)).toEqual({
      status: 'observed',
      tokensPerSecond: 750,
      estimated: false,
      basis: 'visible_deltas',
      tokenQuality: 'exact',
    });
  });

  test('marks a locally tokenized window as approximate', () => {
    const event = makeEvent({ throughput: observed(500, { token_quality: 'estimated' }) });

    expect(eventArrivalRate(event)).toMatchObject({
      estimated: true,
      tokenQuality: 'estimated',
    });
  });

  test('keeps the server unavailability reason and rate', () => {
    const event = makeEvent({
      throughput: {
        status: 'unavailable',
        method: 'arrival_window_v1',
        reason: 'insufficient_arrivals',
      },
      tokens_per_second: 999,
    });

    expect(eventArrivalRate(event)).toEqual({
      status: 'unavailable',
      reason: 'insufficient_arrivals',
    });
  });

  test('treats an old server alias as legacy, never as a qualified observation', () => {
    const event = makeEvent({ tokens_per_second: 800, speed_estimated: true });

    expect(eventArrivalRate(event)).toEqual({
      status: 'legacy',
      tokensPerSecond: 800,
      estimated: true,
      basis: null,
      tokenQuality: null,
    });
  });

  test('stays unavailable when neither the object nor an alias carries a rate', () => {
    expect(eventArrivalRate(makeEvent())).toEqual({ status: 'unavailable', reason: null });
  });

  test('ignores non-finite and non-positive rates', () => {
    expect(eventArrivalRate(makeEvent({ throughput: observed(Number.NaN) }))).toEqual({
      status: 'unavailable',
      reason: null,
    });
    expect(eventArrivalRate(makeEvent({ throughput: observed(0) }))).toEqual({
      status: 'unavailable',
      reason: null,
    });
    expect(eventArrivalRate(makeEvent({ tokens_per_second: Number.NaN }))).toEqual({
      status: 'unavailable',
      reason: null,
    });
  });
});

describe('analytics event effective output rate', () => {
  test("reads CPA's whole-attempt rate separately from the arrival window", () => {
    const event = makeEvent({
      effective_output_tokens_per_second: 42.5,
      throughput: observed(750),
    });
    expect(eventEffectiveOutputRate(event)).toBe(42.5);
    expect(eventArrivalRate(event)).toMatchObject({ status: 'observed', tokensPerSecond: 750 });
  });

  test('requires a positive finite value', () => {
    expect(
      eventEffectiveOutputRate(makeEvent({ effective_output_tokens_per_second: 0 }))
    ).toBeNull();
    expect(
      eventEffectiveOutputRate(makeEvent({ effective_output_tokens_per_second: -1 }))
    ).toBeNull();
    expect(
      eventEffectiveOutputRate(makeEvent({ effective_output_tokens_per_second: Number.NaN }))
    ).toBeNull();
  });
});

describe('analytics event output window evidence', () => {
  test('converts monotonic offsets to milliseconds', () => {
    const event = makeEvent({
      output_timing: {
        version: 1,
        protocol: 'chat',
        source: 'source_reader',
        status: 'observed',
        first_arrival_ns: 1_200_000_000,
        last_arrival_ns: 3_500_000_000,
        arrival_count: 9,
        window_tokens: 180,
        token_quality: 'estimated',
        coverage: 'visible_deltas',
      },
    });

    expect(eventOutputWindow(event)).toEqual({
      firstArrivalMs: 1_200,
      lastArrivalMs: 3_500,
      spanMs: 2_300,
      arrivalCount: 9,
      windowTokens: 180,
      tokenQuality: 'estimated',
      coverage: 'visible_deltas',
    });
  });

  test('rejects unavailable and out-of-order windows', () => {
    const base = {
      version: 1 as const,
      protocol: 'chat',
      source: 'source_reader',
      first_arrival_ns: 2_000_000_000,
      last_arrival_ns: 1_000_000_000,
    };
    expect(
      eventOutputWindow(makeEvent({ output_timing: { ...base, status: 'observed' } }))
    ).toBeNull();
    expect(
      eventOutputWindow(
        makeEvent({
          output_timing: { ...base, status: 'unavailable', reason: 'coverage_limit' },
        })
      )
    ).toBeNull();
  });
});

describe('arrival unavailability copy', () => {
  test('maps frozen reasons and falls back for unknown codes', () => {
    expect(rateReasonKey('legacy_timing')).toBe('analytics.rate_reason_legacy_timing');
    expect(rateReasonKey('coverage_limit')).toBe('analytics.rate_reason_coverage_limit');
    expect(rateReasonKey('future_reason')).toBe('analytics.rate_reason_unknown');
    expect(rateReasonKey(null)).toBe('analytics.rate_reason_unknown');
  });
});
