import { describe, expect, spyOn, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { parse as parseYaml } from 'yaml';
import { apiClient } from '@/services/api/client';
import { getRoutingCredentials } from '@/services/api/routing';
import i18n from '@/i18n';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { buildConfigPatch } from '@/services/api/configPatch';
import { RoutingTabs } from '@/features/routing/RoutingTabs';
import { PriorityTiers } from '@/features/routing/rules/PriorityTiers';
import {
  groupPriorityTiers,
  routingCredentialState,
  routingRulesChanges,
} from '@/features/routing/rules/logic';
import {
  makeRoutingCondition,
  makeRoutingGroup,
  makeRoutingRule,
} from '@/features/config/routingRules';
import type { RoutingCredential } from '@/types/routing';
import type { VisualConfigValues } from '@/types/visualConfig';

const credentials: RoutingCredential[] = [
  {
    id: 'low',
    label: 'Backup',
    provider: 'codex',
    kind: 'oauth',
    priority: -2,
    weight: 1,
    disabled: false,
  },
  {
    id: 'off',
    label: 'Paused',
    provider: 'claude',
    kind: 'oauth',
    priority: 10,
    weight: 1,
    disabled: true,
  },
  {
    id: 'broken',
    label: 'Broken',
    provider: 'codex',
    kind: 'oauth',
    priority: 10,
    weight: 1,
    disabled: false,
    status: 'error',
    cooldowns: [
      {
        scope: 'credential',
        reason: 'auth',
        retryAt: '2026-11-02T00:00:30Z',
        remainingSeconds: 30,
      },
    ],
  },
  {
    id: 'high',
    label: 'Research',
    provider: 'codex',
    kind: 'oauth',
    priority: 10,
    weight: 1,
    disabled: false,
    cooldowns: [
      {
        scope: 'credential',
        reason: 'quota',
        retryAt: '2026-11-02T00:00:30Z',
        remainingSeconds: 30,
      },
    ],
  },
];
const renderTiers = (loading = false, error = false, members = credentials) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        I18nextProvider,
        { i18n: i18n.cloneInstance({ lng: 'en' }) },
        createElement(PriorityTiers, { credentials: members, loading, error })
      )
    )
  );

function routingDraft(initial: string, latest: string, changes: Partial<VisualConfigValues>) {
  function Harness() {
    const visual = useVisualConfig();
    const [phase, setPhase] = useState(0);
    if (phase === 0) {
      visual.loadVisualValuesFromYaml(initial);
      setPhase(1);
    } else if (phase === 1) {
      visual.setVisualValues(routingRulesChanges(changes));
      setPhase(2);
    } else {
      return createElement('pre', null, visual.applyVisualChangesToYaml(latest));
    }
    return null;
  }
  return renderToStaticMarkup(createElement(Harness))
    .slice(5, -6)
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

describe('standalone routing rules', () => {
  test('groups highest priority first and retains disabled credentials', () => {
    const tiers = groupPriorityTiers(credentials);
    expect(tiers.map((tier) => tier.priority)).toEqual([10, -2]);
    expect(tiers[0].members.map((member) => member.id)).toEqual(['off', 'broken', 'high']);
    const markup = renderTiers();
    expect(markup.indexOf('Priority 10')).toBeLessThan(markup.indexOf('Priority -2'));
    expect(markup).toContain('Preferred');
    expect(markup).toContain('Fallback 1');
    expect(markup).toContain('Codex · Research');
    expect(markup).toContain('Codex · Broken');
    expect(markup).toContain('Claude · Paused');
    expect(markup).toContain('title="Error"');
    expect(markup).toContain('title="Cooling down"');
    expect(markup).toContain('>Error: </span>Codex · Broken');
    expect(markup).toContain('title="Disabled"');
    expect(markup).toContain('title="Usable"');
    expect(markup).toContain('>Cooling down: </span>Codex · Research');
    expect(markup).toContain('>Usable: </span>Codex · Backup');
    expect(markup).toContain('href="/routing/tiers"');
    expect(markup).not.toContain('href="/routing"');
    expect(markup).not.toContain('<details');
    expect(markup).not.toContain('<summary');
  });

  test('ranks chip state as disabled, error, cooling, then usable', () => {
    const base: RoutingCredential = {
      id: 'state',
      label: 'State',
      provider: 'codex',
      kind: 'oauth',
      priority: 10,
      weight: 1,
      disabled: false,
      cooldowns: [
        {
          scope: 'credential',
          reason: 'quota',
          retryAt: '2026-11-02T00:00:30Z',
          remainingSeconds: 30,
        },
      ],
    };
    expect(routingCredentialState({ ...base, disabled: true, status: 'error' })).toBe('disabled');
    expect(routingCredentialState({ ...base, status: 'error' })).toBe('error');
    expect(routingCredentialState(base)).toBe('cooling');
    expect(routingCredentialState({ ...base, cooldowns: [] })).toBe('usable');
  });

  test('handles loading, error, and an empty credential list', () => {
    expect(renderTiers(true)).toContain('Loading');
    expect(renderTiers(false, true)).toContain('Credential list unavailable');
    expect(renderTiers(false, false, [])).toContain('Nothing to route yet');
  });

  test('builds only routing-field patches on the latest server configuration', () => {
    const initial = `server: {port: 8317}
routing:
  strategy: round-robin
  session-affinity: false
  session-affinity-ttl: 1h
  session-affinity-rebind-on: any
  session-affinity-subagents: false
  force-model-prefix: false
  rules: []
`;
    const latest =
      initial.replace('8317', '9000') +
      `api-keys:
  codex: [{api-key: synthetic, priority: 42, weight: 7}]
future: {preserved: true}
`;
    const rule = {
      ...makeRoutingRule(
        makeRoutingGroup('all', [{ ...makeRoutingCondition(), op: 'match', value: '*' }])
      ),
      routeTo: ['high'],
    };
    const draft = routingDraft(initial, latest, {
      routingStrategy: 'fill-first',
      routingSessionAffinity: true,
      routingSessionAffinityTTL: '2h',
      sessionAffinityRebindOn: 'quota',
      routingSessionAffinitySubagents: true,
      forceModelPrefix: true,
      routingRules: [rule],
      port: '1111',
      apiKeysText: 'must-not-write',
    });
    const plan = buildConfigPatch(latest, draft);
    expect(Object.keys(plan.patch)).toEqual(['routing']);
    expect(plan.deletions).toEqual([]);
    expect(plan.patch.routing).toEqual({
      strategy: 'fill-first',
      'session-affinity': true,
      'session-affinity-ttl': '2h',
      'session-affinity-rebind-on': 'quota',
      'session-affinity-subagents': true,
      'force-model-prefix': true,
      rules: [{ when: { all: [{ model: { match: '*' } }] }, 'route-to': ['high'] }],
    });
    const parsed = parseYaml(draft);
    expect(parsed.server.port).toBe(9000);
    expect(parsed['api-keys'].codex[0]).toEqual({
      'api-key': 'synthetic',
      priority: 42,
      weight: 7,
    });
    expect(parsed.future).toEqual({ preserved: true });
  });

  test('leaves concurrent policy changes intact when only rules change', () => {
    const initial = 'routing: {strategy: round-robin, session-affinity: false, rules: []}\n';
    const latest =
      'routing: {strategy: fill-first, session-affinity: true, rules: [], future: keep}\n';
    const draft = routingDraft(initial, latest, {
      routingRules: [
        {
          ...makeRoutingRule(
            makeRoutingGroup('all', [{ ...makeRoutingCondition(), op: 'match', value: '*' }])
          ),
          routeTo: ['high'],
        },
      ],
    });
    const plan = buildConfigPatch(latest, draft);
    expect(Object.keys(plan.patch.routing as object)).toEqual(['rules']);
    expect(parseYaml(draft).routing).toMatchObject({
      strategy: 'fill-first',
      'session-affinity': true,
      future: 'keep',
    });
  });
});

test('normalizes configured API-key names and routing cooldowns at the API boundary', async () => {
  const get = spyOn(apiClient, 'get').mockResolvedValue({
    home_mode: false,
    credentials: [
      {
        id: 'cred-1',
        label: 'codex-key-0',
        name: '  Research  ',
        provider: 'codex',
        kind: 'api-key',
        priority: 10,
        weight: 1,
        disabled: false,
        status: '  ERROR  ',
        cooldowns: [
          {
            scope: 'credential',
            reason: 'quota',
            retry_at: '2026-11-02T00:00:30Z',
            remaining_seconds: 30,
          },
        ],
      },
      { id: 'cred-2', label: 'oauth-file', provider: 'claude', kind: 'oauth', name: '' },
    ],
    client_types: ['codex'],
  });
  try {
    const response = await getRoutingCredentials();
    expect(response.credentials[0]).toMatchObject({
      label: 'Research',
      name: 'Research',
      status: 'ERROR',
      cooldowns: [
        {
          scope: 'credential',
          retryAt: '2026-11-02T00:00:30Z',
          remainingSeconds: 30,
        },
      ],
    });
    expect(response.credentials[1]).toEqual({
      id: 'cred-2',
      label: 'oauth-file',
      provider: 'claude',
      kind: 'oauth',
      priority: 0,
      weight: 0,
      disabled: false,
    });
  } finally {
    get.mockRestore();
  }
});

test('routing navigation uses links with the current page marked', () => {
  for (const value of ['credentials', 'rules', 'dry-run'] as const) {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RoutingTabs, { value }))
    );
    expect(html).toContain('<nav');
    expect(html).toContain('href="/routing/tiers"');
    expect(html).toContain('href="/routing/rules"');
    expect(html).toContain('href="/routing/dry-run"');
    expect(html).toContain('role="tablist"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).not.toContain('href="/routing"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-pressed');
  }
});
