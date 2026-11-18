import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { EventHeaders } from '@/features/analytics/views/events/EventHeaders';
import { formatHeaders } from '@/features/analytics/views/events/eventDiagnostics';
import { analyticsApi } from '@/services/api/analytics';
import { apiClient } from '@/services/api/client';
import i18n from '@/i18n';
import type { AnalyticsHeaderDetail } from '@/types';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
const range = { start: '2026-11-15T00:00:00Z', end: '2026-11-16T00:00:00Z', time_zone: 'UTC' };
const response: AnalyticsHeaderDetail = {
  blocks: [
    {
      started_at: range.start,
      method: 'POST',
      url: '/v1/messages',
      headers: { 'X-Test': ['one', 'two'] },
    },
  ],
};
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
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
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('headers retain every repeated value', () => {
  expect(formatHeaders({ Z: ['last'], A: ['first', 'second'] })).toBe(
    'A: first\nA: second\nZ: last'
  );
});

test('header API reads one hop with the active range', async () => {
  const get = spyOn(apiClient, 'get').mockResolvedValue({ blocks: null });
  try {
    expect(await analyticsApi.eventHeaders('a'.repeat(32), range, 'cpa_to_provider')).toEqual({
      blocks: [],
    });
    const path = get.mock.calls[0]![0];
    expect(path).toStartWith(`/analytics/attempts/${'a'.repeat(32)}/headers?`);
    const params = new URL(path, 'http://localhost').searchParams;
    expect(params.get('hop')).toBe('cpa_to_provider');
    expect(params.get('start')).toBe(range.start);
    expect(params.get('end')).toBe(range.end);
  } finally {
    get.mockRestore();
  }
});

for (const trigger of ['hover', 'focus', 'open'] as const) {
  test(`headers load on ${trigger}, deduplicate and stay hidden until expanded`, async () => {
    let resolve!: (value: AnalyticsHeaderDetail) => void;
    const load = spyOn(analyticsApi, 'eventHeaders').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(createElement(EventHeaders, { attemptId: 'a', range, hop: 'client_to_cpa' }))
      );
      expect(load).not.toHaveBeenCalled();
      const details = container.querySelector('details')!;
      await act(async () => {
        if (trigger === 'hover')
          details.dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
        else if (trigger === 'focus')
          details
            .querySelector('summary')!
            .dispatchEvent(new browser.FocusEvent('focusin', { bubbles: true }));
        else {
          details.open = true;
          details.dispatchEvent(new browser.Event('toggle'));
        }
      });
      expect(load).toHaveBeenCalledTimes(1);
      await act(async () => {
        details.dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
        resolve(response);
      });
      expect(load).toHaveBeenCalledTimes(1);
      if (trigger !== 'open') expect(container.querySelector('pre')).toBeNull();
      await act(async () => {
        details.open = true;
        details.dispatchEvent(new browser.Event('toggle'));
      });
      expect(container.querySelector('pre')?.textContent).toBe('X-Test: one\nX-Test: two');
      // Each line splits into name, separator, and value tokens for highlighting.
      const tokens = [...container.querySelectorAll('pre > span')].map((line) =>
        [...line.querySelectorAll('span')].map((token) => token.textContent)
      );
      expect(tokens).toEqual([
        ['X-Test', ': ', 'one'],
        ['X-Test', ': ', 'two'],
      ]);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      load.mockRestore();
    }
  });
}

test('failed reads retry explicitly and connection changes discard pending headers', async () => {
  let resolve!: (value: AnalyticsHeaderDetail) => void;
  const load = spyOn(analyticsApi, 'eventHeaders')
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const apiBase = apiClient.getApiBase();
  try {
    await act(async () =>
      root.render(createElement(EventHeaders, { attemptId: 'a', range, hop: 'client_to_cpa' }))
    );
    const details = container.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new browser.Event('toggle'));
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => container.querySelector('button')!.click());
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      apiClient.setConfig({ apiBase: 'http://changed.invalid', managementKey: '' });
      resolve(response);
    });
    expect(details.open).toBe(false);
    expect(container.textContent).not.toContain('X-Test');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    load.mockRestore();
    apiClient.setConfig({ apiBase, managementKey: '' });
  }
});
