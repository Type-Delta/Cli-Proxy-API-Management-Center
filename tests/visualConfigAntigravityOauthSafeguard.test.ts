import { expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '../src/types/visualConfig';

test('Antigravity OAuth safeguard reads and writes its provider settings', () => {
  expect(DEFAULT_VISUAL_VALUES.antigravityOauthSafeguard).toBe(false);
  const source =
    'oauth:\n  providers:\n    antigravity:\n      oauth-safeguard: true\n      antigravity-credits: true\n      oauth-safeguard-client-identities: [old-client]\n';

  function Harness() {
    const config = useVisualConfig();
    const [phase, setPhase] = useState(0);
    if (phase === 0) {
      config.loadVisualValuesFromYaml(source);
      setPhase(1);
    } else if (phase === 1) {
      expect(config.visualValues.antigravityOauthSafeguard).toBe(true);
      expect(config.visualValues.antigravityOauthSafeguardClientIdentities).toEqual(['old-client']);
      config.setVisualValues({
        antigravityOauthSafeguard: false,
        antigravityOauthSafeguardClientIdentities: ['t3code', 't3-code'],
      });
      setPhase(2);
    } else {
      return createElement('pre', null, encodeURIComponent(config.applyVisualChangesToYaml(source)));
    }
    return null;
  }

  const markup = renderToStaticMarkup(createElement(Harness));
  expect(parse(decodeURIComponent(markup.slice('<pre>'.length, -'</pre>'.length)))).toEqual({
    oauth: {
      providers: {
        antigravity: {
          'oauth-safeguard': false,
          'antigravity-credits': true,
          'oauth-safeguard-client-identities': ['t3code', 't3-code'],
        },
      },
    },
  });
});
