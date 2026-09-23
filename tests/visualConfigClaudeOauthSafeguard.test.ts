import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '../src/types/visualConfig';

const unwrapPre = (markup: string) =>
  decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length));

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
});
