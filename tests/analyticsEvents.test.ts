import { describe, expect, test } from 'bun:test';
import type { AnalyticsEvent } from '@/types';
import { eventSpeed, eventSpeedIsEstimated } from '@/features/analytics/views/Events';

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

  test('does not invent speed when both generation time and TTFT are unavailable', () => {
    const event = makeEvent({ generation_time_ms: null, time_to_first_token_ms: null });

    expect(eventSpeed(event)).toBeNull();
  });

  test('labels the latency-minus-TTFT fallback as estimated', () => {
    const event = makeEvent({ generation_time_ms: null });

    expect(eventSpeed(event)).toBeCloseTo(11.111111, 5);
    expect(eventSpeedIsEstimated(event)).toBe(true);
  });
});
