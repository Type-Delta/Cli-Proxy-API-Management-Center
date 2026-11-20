import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { normalizeAuthFilesResponse } from '../src/services/api/authFiles';
import type { AuthFilesResponse } from '../src/types/authFile';

const listing = (files: Record<string, unknown>[]) =>
  normalizeAuthFilesResponse({ files } as unknown as AuthFilesResponse);

describe('armed manual reset', () => {
  test('normalizes the armed flag and reserve bypassability from the listing', () => {
    const [armed, plain] = listing([
      {
        name: 'a.json',
        type: 'codex',
        manual_reset_armed: true,
        quota_reserve_state: { hits: [{ bar_id: 'weekly', reserve_percent: 30 }] },
        quota_reserve_bypassable: false,
      },
      { name: 'b.json', type: 'claude', manual_reset_armed: 'yes' },
    ]).files;
    expect(armed.manualResetArmed).toBeTrue();
    expect(armed.quotaReserveState?.bypassable).toBeFalse();
    expect(plain.manualResetArmed).toBeUndefined();
  });

  test('the quota card swaps its refresh pill for the arm toggle', () => {
    const card = readFileSync('src/features/quota/components/QuotaCard.tsx', 'utf8');
    expect(card).not.toContain("t('auth_files.quota_refresh_single')");
    // The label carries the state, so the button must not also announce aria-pressed.
    expect(card).toContain(
      "armed ? 'quota_management.manual_reset_armed' : 'quota_management.manual_reset_arm'"
    );
    expect(card).not.toContain('aria-pressed');
    expect(card).toContain(
      "!readOnly && Boolean(onToggleArm) && (entry.type === 'claude' || entry.type === 'codex')"
    );
    // A failed read stays retryable without the pill: the error strip is the button.
    expect(card).toMatch(/<button\s+type="button"\s+className=\{styles\.errorStrip\}/);
  });

  test('the toggle writes the field the backend validates', () => {
    const hook = readFileSync('src/features/quota/hooks/useQuotaActions.ts', 'utf8');
    expect(hook).toContain('{ manual_reset_armed: armed ? true : null }');
  });

  test('the page re-syncs CPA-owned credential state after quota reads and while armed', () => {
    const page = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
    expect(page).toContain('quotaReserveState: next.quotaReserveState');
    expect(page).toContain(
      'manualResetArmed: armCurrent ? next.manualResetArmed : file.manualResetArmed'
    );
    expect(page).toContain('if (finished) void syncCredentialState();');
    expect(page).toContain('window.setInterval(() => void syncCredentialState(), 60_000)');
  });
});
