import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { useConfigDocument } from '@/features/config/hooks/useConfigDocument';
import { triggerHeaderRefresh, useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { configFileApi } from '@/services/api/configFile';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import i18n from '@/i18n';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  await i18n.changeLanguage('en');
});
afterAll(() => {
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
});
afterEach(() => {
  useNotificationStore.setState({ notifications: [] });
  useNotificationStore.getState().hideConfirmation();
});

const initial = `routing:
  rules:
    - name: Original
      when: {model: {match: '*'}}
      route-to: [one]
`;
const concurrent =
  initial +
  `    - name: Concurrent
      when: {model: {match: '*'}}
      route-to: [two]
`;

async function withEditor(
  run: (
    editor: () => {
      visual: ReturnType<typeof useVisualConfig>;
      doc: ReturnType<typeof useConfigDocument>;
    },
    read: ReturnType<typeof spyOn<typeof configFileApi, 'fetchConfigYaml'>>
  ) => Promise<void>
) {
  const read = spyOn(configFileApi, 'fetchConfigYaml').mockResolvedValue(initial);
  const patch = spyOn(apiClient, 'patch').mockResolvedValue({});
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current: {
    visual: ReturnType<typeof useVisualConfig>;
    doc: ReturnType<typeof useConfigDocument>;
  };
  function Harness() {
    const visual = useVisualConfig();
    const doc = useConfigDocument({ mode: 'visual', ...visual });
    useHeaderRefresh(doc.handleReload);
    current = { visual, doc };
    return null;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      const { visual } = current;
      visual.setVisualValues({
        routingRules: visual.visualValues.routingRules.map((rule) => ({
          ...rule,
          name: 'Renamed',
        })),
      });
    });
    await run(() => current, read);
    expect(patch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    read.mockRestore();
    patch.mockRestore();
  }
}

describe('shared visual config save lifecycle', () => {
  for (const confirmation of [false, true]) {
    test(`rejects concurrent rule append ${confirmation ? 'on confirmation' : 'before preview'} with conflict UX`, async () => {
      await withEditor(async (editor, read) => {
        if (confirmation) {
          await act(async () => editor().doc.handleSave());
          expect(editor().doc.diffModalOpen).toBe(true);
        }
        read.mockResolvedValue(concurrent);
        await act(async () => {
          if (confirmation) await editor().doc.handleConfirmSave();
          else await editor().doc.handleSave();
        });
        expect(editor().doc.saving).toBe(false);
        expect(editor().doc.isDirty).toBe(true);
        expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
          type: 'error',
          message: expect.stringContaining('routing.rules'),
        });
        // Discard/reload remains available to recover from the rejected save.
        await act(async () => editor().doc.handleReload());
        await act(async () => useNotificationStore.getState().confirmation.options?.onConfirm());
        expect(editor().doc.isDirty).toBe(false);
        expect(editor().visual.visualValues.routingRules.map((rule) => rule.name)).toEqual([
          'Original',
          'Concurrent',
        ]);
      });
    });
  }

  test('header refresh during a pending save cannot supersede it or leave saving stuck', async () => {
    await withEditor(async (editor, read) => {
      const pending = Promise.withResolvers<string>();
      read.mockReturnValueOnce(pending.promise);
      let save: Promise<void>;
      await act(async () => {
        save = editor().doc.handleSave();
      });
      expect(editor().doc.saving).toBe(true);
      await act(async () => triggerHeaderRefresh());
      const confirmation = useNotificationStore.getState().confirmation;
      // Reproduce the old path, including accepting the unexpected reload dialog.
      if (confirmation.isOpen) await act(async () => confirmation.options?.onConfirm());
      await act(async () => {
        pending.resolve(initial);
        await save;
      });
      expect(editor().doc.saving).toBe(false);
      expect(confirmation.isOpen).toBe(false);
      expect(read).toHaveBeenCalledTimes(2);
      expect(editor().doc.diffModalOpen).toBe(true);
    });
  });
});
