import { describe, expect, test } from 'bun:test';
import {
  redactViewerKeyId,
  viewerAfterCopy,
} from '@/features/analytics/views/manage/sharedViewsLogic';

describe('shared-view credential handling', () => {
  test('retains the one-time viewer response when clipboard copy fails', () => {
    const viewer = { id: 'viewer-1', credential: 'one-time-secret' };

    expect(viewerAfterCopy(viewer, false)).toBe(viewer);
    expect(viewerAfterCopy(viewer, true)).toBeNull();
  });

  test('redacts full viewer key IDs in server-wide metadata lists', () => {
    const keyId = 'abcdef0123456789abcdef0123456789';

    expect(redactViewerKeyId(keyId)).toBe('abcd…6789');
    expect(redactViewerKeyId(keyId)).not.toContain(keyId);
  });
});
