import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import i18n from '@/i18n';
import en from '../src/i18n/locales/en.json';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let ModelMappingDiagram: typeof import('../src/components/modelAlias').ModelMappingDiagram;

beforeAll(async () => {
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Node: browser.Node,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    MutationObserver: browser.MutationObserver,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  await i18n.changeLanguage('en');
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ ModelMappingDiagram } = await import('../src/components/modelAlias'));
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const modelAlias = { codex: [{ name: 'gpt-test', alias: 'client-test', fork: false }] };
// The page passes a memoized catalog; the diagram's default literal would relayout every render.
const allProviderModels = {};

// Bun leaves CSS module classes undefined, so locate nodes by text and the portaled menu by position.
function menuItems() {
  const menu = Array.from(document.body.children).find((node) => (node as HTMLElement).style?.top);
  return Array.from(menu?.querySelectorAll(':scope > div') ?? []).filter(
    (item) => item.textContent
  );
}

function menuLabels() {
  return menuItems().map((item) => item.textContent);
}

async function rightClick(text: string) {
  const target = Array.from(document.querySelectorAll('span')).find(
    (item) => item.textContent === text
  );
  expect(target).toBeDefined();
  await React.act(async () => {
    target!.dispatchEvent(new browser.MouseEvent('contextmenu', { bubbles: true }));
  });
}

describe('model mapping diagram while a save is pending', () => {
  test('the page withholds every graph draft editor while disabled', () => {
    const source = readFileSync('src/pages/AuthFilesOAuthModelAliasEditPage.tsx', 'utf8');
    const diagram = source.slice(source.indexOf('<ModelMappingDiagram'));
    expect(diagram).toContain('{...(disabled ? {} : graphEditors)}');
    for (const editor of [
      'onUpdate',
      'onDeleteLink',
      'onToggleFork',
      'onRenameAlias',
      'onDeleteAlias',
      'onDeleteProvider',
    ]) {
      expect(diagram.slice(0, diagram.indexOf('/>'))).not.toContain(`${editor}=`);
    }
  });

  test('blocks graph delete, rename, fork and unlink changes without editors', async () => {
    const calls: string[] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push(`${name}:${args.join(',')}`);
    const editors = {
      onUpdate: record('update'),
      onDeleteLink: record('unlink'),
      onToggleFork: record('fork'),
      onRenameAlias: record('rename'),
      onDeleteAlias: record('deleteAlias'),
      onDeleteProvider: record('deleteProvider'),
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (saving: boolean) =>
      React.act(async () => {
        root.render(
          React.createElement(ModelMappingDiagram, {
            modelAlias,
            allProviderModels,
            onEditProvider: () => {},
            ...(saving ? {} : editors),
          })
        );
      });
    try {
      await render(false);
      await rightClick('client-test');
      expect(menuLabels()).toEqual([
        en.oauth_model_alias.diagram_rename,
        en.oauth_model_alias.diagram_settings,
        en.oauth_model_alias.diagram_delete_alias,
      ]);

      // The save starts while the alias menu is open.
      await render(true);
      expect(menuLabels()).toEqual([en.oauth_model_alias.diagram_settings]);

      await rightClick('codex');
      expect(menuLabels()).toEqual([en.common.edit]);

      await rightClick('client-test');
      const settings = menuItems()[0];
      await React.act(async () => {
        (settings as unknown as HTMLElement).click();
      });
      const dialog = document.body.querySelector('[role="dialog"]')!;
      expect(dialog).not.toBeNull();
      const toggle = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      const unlink = dialog.querySelector<HTMLButtonElement>('button[aria-label*="gpt-test"]')!;
      expect(toggle.disabled).toBe(true);
      expect(unlink.disabled).toBe(true);
      await React.act(async () => {
        toggle.click();
        unlink.click();
      });
      expect(calls).toEqual([]);
    } finally {
      await React.act(async () => root.unmount());
      container.remove();
    }
  });
});
