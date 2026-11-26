import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { captureDeleteGuard } from '@/features/providers/deleteGuard';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});
afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

afterEach(() => {
  mock.restore();
  useAuthStore.setState({ connectionStatus: 'disconnected', scope: null });
});

const open = (locked = false) => {
  let revision = 7;
  spyOn(apiClient, 'getConnectionRevision').mockImplementation(() => revision);
  useAuthStore.setState({ connectionStatus: 'connected', scope: 'full-access' });
  let lock = locked;
  const stillAllowed = captureDeleteGuard(() => lock);
  return {
    stillAllowed,
    switchConnection: () => (revision += 1),
    setLock: (value: boolean) => (lock = value),
  };
};

test('a delete confirmation is valid only for the unlocked, full-access session that opened it', () => {
  expect(open().stillAllowed()).toBe(true);

  const disconnected = open();
  useAuthStore.setState({ connectionStatus: 'disconnected' });
  expect(disconnected.stillAllowed()).toBe(false);

  const switched = open();
  switched.switchConnection();
  expect(switched.stillAllowed()).toBe(false);

  const readOnly = open();
  useAuthStore.setState({ scope: 'read-only' });
  expect(readOnly.stillAllowed()).toBe(false);

  const busy = open();
  busy.setLock(true);
  expect(busy.stillAllowed()).toBe(false);
});

test('native connection and resource deletions both run through the captured guard', () => {
  const page = readFileSync(
    new URL('../src/features/providers/ProvidersWorkbenchPage.tsx', import.meta.url),
    'utf8'
  );
  expect(page.match(/captureDeleteGuard\(isMutationLocked\)/g)).toHaveLength(2);
  expect(page.match(/runGuardedDelete\(stillAllowed,/g)).toHaveLength(2);
  expect(page).not.toMatch(/onConfirm: async \(\) => \{\s*try \{\s*await workbench\.delete/);
});
