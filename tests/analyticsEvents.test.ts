import { describe, expect, test } from 'bun:test';
import type { AnalyticsEvent } from '@/types';
import {
  eventSpeed,
  eventSpeedIsEstimated,
} from '@/features/analytics/views/events/eventDiagnostics';

const makeEvent = (overrides: Partial<AnalyticsEvent> = {}) =>
  ({
    latency_ms: 10_000,
    time_to_first_token_ms: 1_000,
    generation_time_ms: 1_000,
    tokens: { output: 100 },
    ...overrides,
  }) as AnalyticsEvent;

describe('analytics event speed', () => {
  test('uses observed generation time for tokens per second', () => {
    expect(eventSpeed(makeEvent())).toBe(100);
    expect(eventSpeedIsEstimated(makeEvent())).toBe(false);
  });

  test('keeps fast observed generation speeds measured', () => {
    const event = makeEvent({ generation_time_ms: 400, tokens: { output: 300 } });

    expect(eventSpeed(event)).toBe(750);
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });

  test('does not invent speed when both generation time and TTFT are unavailable', () => {
    const event = makeEvent({ generation_time_ms: null, time_to_first_token_ms: null });

    expect(eventSpeed(event)).toBeNull();
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });

  test('uses a positive fallback when generation is zero', () => {
    const event = makeEvent({ generation_time_ms: 0, time_to_first_token_ms: 500 });

    expect(eventSpeed(event)).toBeCloseTo(10.5263157895, 8);
    expect(eventSpeedIsEstimated(event)).toBe(true);
  });

  test('labels the latency-minus-TTFT fallback as estimated', () => {
    const event = makeEvent({ generation_time_ms: null });

    expect(eventSpeed(event)).toBeCloseTo(11.111111, 5);
    expect(eventSpeedIsEstimated(event)).toBe(true);
  });

  test('uses the fallback for invalid generation and rejects non-positive fallback durations', () => {
    expect(eventSpeed(makeEvent({ generation_time_ms: Number.NaN }))).toBeCloseTo(11.111111, 5);
    expect(eventSpeedIsEstimated(makeEvent({ generation_time_ms: Number.NaN }))).toBe(true);
    expect(
      eventSpeed(makeEvent({ generation_time_ms: 0, time_to_first_token_ms: 10_000 }))
    ).toBeNull();
    expect(
      eventSpeedIsEstimated(makeEvent({ generation_time_ms: 0, time_to_first_token_ms: 10_000 }))
    ).toBe(false);
  });
});
