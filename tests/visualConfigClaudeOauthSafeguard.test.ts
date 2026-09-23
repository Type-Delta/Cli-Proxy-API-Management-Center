import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '../src/types/visualConfig';

const unwrapPre = (markup: string) =>
  decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length));

const getNestedString = (value: unknown, path: string[]): string | undefined => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
};

describe('visual config Claude OAuth safeguard', () => {
  test('defaults to off and reads the YAML setting', () => {
    expect(DEFAULT_VISUAL_VALUES.claudeHeaderOauthSafeguard).toBe(false);

    function Harness() {
      const visualConfig = useVisualConfig();
      const [loaded, setLoaded] = useState(false);

      if (!loaded) {
        visualConfig.loadVisualValuesFromYaml('claude-header-defaults:\n  oauth-safeguard: true\n');
        setLoaded(true);
        return null;
      }

      return createElement(
        'pre',
        null,
        encodeURIComponent(String(visualConfig.visualValues.claudeHeaderOauthSafeguard))
      );
    }

    expect(unwrapPre(renderToStaticMarkup(createElement(Harness)))).toBe('true');
  });

  test('writes the opt-in boolean while preserving sibling Claude defaults', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [updated, setUpdated] = useState(false);

      if (!updated) {
        visualConfig.setVisualValues({ claudeHeaderOauthSafeguard: true });
        setUpdated(true);
        return null;
      }

      return createElement(
        'pre',
        null,
        encodeURIComponent(
          visualConfig.applyVisualChangesToYaml(
            'claude-header-defaults:\n  user-agent: custom-agent\n  oauth-safeguard: false\n'
          )
        )
      );
    }

    expect(parseYaml(unwrapPre(renderToStaticMarkup(createElement(Harness))))).toEqual({
      'claude-header-defaults': {
        'user-agent': 'custom-agent',
        'oauth-safeguard': true,
      },
    });
  });

  test('explains CPA-managed private capture and fail-closed behavior in every locale', async () => {
    const localeRequirements = {
      en: [
        'CPA Claude OAuth credential',
        '24 hours',
        'global Claude data',
        'failed update keeps the last successful reference',
        'only if no valid active reference is available',
      ],
      'zh-CN': [
        '自身的 Claude OAuth 凭据',
        '24 小时',
        '全局 Claude 数据',
        '候选更新失败时会保留最近一次成功捕获',
        '仅当没有有效的当前参考配置时',
      ],
      'zh-TW': [
        '自身的 Claude OAuth 憑證',
        '24 小時',
        '全域 Claude 資料',
        '候選更新失敗時會保留最近一次成功擷取',
        '僅在沒有有效的目前參考設定檔時',
      ],
      ru: [
        'OAuth-учётные данные CPA для Claude',
        '24 часа',
        'Глобальные данные Claude не используются',
        'Неудачное обновление сохраняет последний успешно полученный эталон',
        'только если действующий эталон отсутствует или недействителен',
      ],
    };

    for (const [locale, requiredPhrases] of Object.entries(localeRequirements)) {
      const localeData: unknown = await Bun.file(`src/i18n/locales/${locale}.json`).json();
      const description = getNestedString(localeData, [
        'config_management',
        'visual',
        'sections',
        'headers',
        'oauth_safeguard_desc',
      ]);

      expect(description).toBeDefined();
      expect(description).not.toContain('--claude-capture');
      for (const phrase of requiredPhrases) expect(description).toContain(phrase);
    }
  });
});
