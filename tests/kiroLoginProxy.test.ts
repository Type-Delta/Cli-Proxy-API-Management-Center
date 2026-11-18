import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { useOAuthFlows } from '@/features/oauth/hooks/useOAuthFlows';
import { OAUTH_PROVIDERS } from '@/features/oauth/providers';
import { oauthApi } from '@/services/api/oauth';

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const windowInstance = new Window({ url: 'http://localhost/' });

beforeAll(() => {
  for (const [key, value] of Object.entries({
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
});

afterAll(() => {
  windowInstance.close();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
});

describe('Kiro login proxy refusal', () => {
  for (const language of ['en', 'ko', 'ru', 'tr', 'vi', 'zh-CN', 'zh-TW']) {
    test(`${language}: refuses a selected proxy and allows setup after clearing it`, async () => {
      const start = spyOn(oauthApi, 'startAuth').mockResolvedValue({
        url: 'https://example.test/kiro-login',
        state: 'kiro-attempt',
      });
      const poll = spyOn(oauthApi, 'getAuthStatus').mockResolvedValue({ status: 'wait' });
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const localized = i18n.cloneInstance({ lng: language });
      let flows!: ReturnType<typeof useOAuthFlows>;
      const setup = { start_url: 'https://example.awsapps.com/start', region: 'us-west-2' };
      const proxy = 'socks5://127.0.0.1:1080';
      function Harness() {
        flows = useOAuthFlows({ providerCards: OAUTH_PROVIDERS, isFocused: () => true });
        return null;
      }
      try {
        await act(async () => {
          root.render(createElement(I18nextProvider, { i18n: localized }, createElement(Harness)));
        });
        await act(async () => flows.setLoginProxy(proxy));
        await act(async () => flows.startAuth('kiro', setup));
        expect(start).not.toHaveBeenCalled();
        expect(poll).not.toHaveBeenCalled();
        expect(flows.loginProxy).toBe(proxy);
        expect(flows.states.kiro).toMatchObject({
          status: 'error',
          polling: false,
          error: localized.t('auth_login.login_proxy_kiro_unsupported'),
        });
        expect(flows.states.kiro.error).not.toContain('auth_login.');
        await act(async () => flows.setLoginProxy(''));
        await act(async () => flows.startAuth('kiro', setup));
        expect(start).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledWith('kiro', expect.any(AbortSignal), {
          extraParams: setup,
        });
        expect(flows.states.kiro.status).toBe('waiting');
      } finally {
        await act(async () => root.unmount());
        container.remove();
        start.mockRestore();
        poll.mockRestore();
      }
    });
  }
});
