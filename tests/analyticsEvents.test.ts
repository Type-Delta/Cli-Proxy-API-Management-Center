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
  test('renders the measured throughput CPA published', () => {
    const event = makeEvent({ tokens_per_second: 750, speed_estimated: false });

    expect(eventSpeed(event)).toBe(750);
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });

  test('labels the throughput CPA estimated', () => {
    const event = makeEvent({ tokens_per_second: 500, speed_estimated: true });

    expect(eventSpeed(event)).toBe(500);
    expect(eventSpeedIsEstimated(event)).toBe(true);
  });

  test('stays unavailable when CPA publishes no rate', () => {
    const event = makeEvent({ tokens_per_second: null, speed_estimated: true });

    expect(eventSpeed(event)).toBeNull();
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });

  test('stays unavailable for servers that do not publish throughput', () => {
    const event = makeEvent();

    expect(eventSpeed(event)).toBeNull();
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });

  test('ignores non-finite throughput', () => {
    const event = makeEvent({ tokens_per_second: Number.NaN });

    expect(eventSpeed(event)).toBeNull();
    expect(eventSpeedIsEstimated(event)).toBe(false);
  });
});
