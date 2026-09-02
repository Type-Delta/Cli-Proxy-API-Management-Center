import { describe, expect, test } from 'bun:test';
import {
  canConfirmPurge,
  cancelAndRefreshJob,
  isTerminalAnalyticsJob,
  purgeConfirmationPhrase,
} from '@/features/analytics/views/manage/maintenanceModel';

describe('analytics maintenance safeguards', () => {
  test('requires the exact typed purge phrase plus preview evidence', () => {
    const keyIdentity = 'key-7f2c1a9b';
    const evidence = {
      keyIdentity,
      batchId: 'purge-abc',
      backupPath: '/var/backups/cpauk-before-purge.sqlite',
    };

    expect(canConfirmPurge({ ...evidence, confirmation: 'PURGE' })).toBe(false);
    expect(
      canConfirmPurge({ ...evidence, confirmation: purgeConfirmationPhrase(keyIdentity) })
    ).toBe(true);
    expect(
      canConfirmPurge({
        ...evidence,
        backupPath: '',
        confirmation: purgeConfirmationPhrase(keyIdentity),
      })
    ).toBe(false);
  });

  test('recognizes job states that need no more polling', () => {
    expect(isTerminalAnalyticsJob('running')).toBe(false);
    expect(isTerminalAnalyticsJob('succeeded')).toBe(true);
    expect(isTerminalAnalyticsJob('canceled')).toBe(true);
  });

  test('awaits cancellation before refreshing job state', async () => {
    const calls: string[] = [];
    const result = await cancelAndRefreshJob(
      async () => {
        calls.push('cancel');
      },
      async () => {
        calls.push('refresh');
        return 'canceled';
      }
    );

    expect(calls).toEqual(['cancel', 'refresh']);
    expect(result).toBe('canceled');
  });
});
