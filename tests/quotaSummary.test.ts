import { describe, expect, test } from 'bun:test';
import {
  LONGEST_RECOVERY_WINDOW_MAP,
  percentageOfLargestTier,
  selectClaudePrimaryWindow,
  selectLongestRecoveryWindow,
  type QuotaSummaryWindow,
} from '@/features/quota/quotaSummary';

const window = (id: string, remainingPercent: number): QuotaSummaryWindow => ({
  id,
  label: id,
  remainingPercent,
  resetAtMs: null,
});

describe('quota summary selection', () => {
  test('uses Fable when weekly remaining ties', () => {
    expect(
      selectClaudePrimaryWindow([
        [window('seven-day', 80), window('seven-day-fable', 80)],
        [window('seven-day', 20)],
      ])
    ).toBe('seven-day-fable');
  });

  test('uses the weekly window with less aggregate remaining', () => {
    expect(
      selectClaudePrimaryWindow([
        [window('seven-day', 90), window('seven-day-fable', 40)],
        [window('seven-day', 80), window('seven-day-fable', 60)],
      ])
    ).toBe('seven-day-fable');
  });

  test('keeps provider recovery windows explicit and prefers OpenCode Go monthly', () => {
    expect(LONGEST_RECOVERY_WINDOW_MAP['opencode-go']).toEqual(
      expect.arrayContaining(['opencode-go-monthly'])
    );
    expect(
      selectLongestRecoveryWindow('opencode-go', [
        window('opencode-go-weekly', 60),
        window('opencode-go-monthly', 80),
      ])?.id
    ).toBe('opencode-go-monthly');
  });

  test('expresses aggregate Claude tier units against the $100 largest tier', () => {
    expect(percentageOfLargestTier(120, 100)).toBe(120);
    expect(percentageOfLargestTier(0, 100)).toBe(0);
  });
});
