import { describe, expect, mock, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import claudeLogo from '@/assets/icons/claude.svg';
import i18n from '@/i18n';
import { ModelLeaderboardAwardCard } from '@/features/analytics/views/leaderboard/ModelLeaderboardAwardCard';
import {
  awardsByMetric,
  formatLeaderboardValue,
  LEADERBOARD_METRICS,
  podiumSlots,
  runnersUpRows,
} from '@/features/analytics/views/leaderboard/modelLeaderboardModel';
import {
  markMascotUrlBroken,
  MODEL_FAMILY_MASCOTS,
  resetMascotFailures,
  resolveModelAvatar,
  resolveModelFamily,
  type AvatarArt,
} from '@/features/analytics/views/leaderboard/mascots';
import {
  ANALYTICS_PAGES,
  analyticsKindsForPage,
  analyticsPageFromPathname,
  analyticsPageKindFromPathname,
} from '@/features/analytics/navigation';
import { analyticsApi, buildModelLeaderboardRequest } from '@/services/api/analytics';
import { apiClient } from '@/services/api/client';
import type { AnalyticsModelLeaderboardRow } from '@/types';

// Await i18n init so static renders carry the English copy instead of raw keys.
await i18n.changeLanguage('en');

const row = (
  rank: number,
  model: string,
  value: number,
  extra: Partial<AnalyticsModelLeaderboardRow> = {}
): AnalyticsModelLeaderboardRow => ({ rank, model, value, ...extra });

const okResponse = (data: unknown) => ({ status: 200, data, headers: {} });

describe('model family resolution', () => {
  test('derives the family from the model id, independent of provider', () => {
    expect(resolveModelFamily('claude-sonnet-5-5')).toBe('claude');
    expect(resolveModelFamily('gpt-5.6-luna')).toBe('gpt');
    expect(resolveModelFamily('gemini-3-pro')).toBe('gemini');
    expect(resolveModelFamily('glm-5.3-flash')).toBe('glm');
    expect(resolveModelFamily('deepseek-chat')).toBe('deepseek');
    expect(resolveModelFamily('kimi-k3')).toBe('kimi');
    expect(resolveModelFamily('qwen3-max')).toBe('qwen');
    expect(resolveModelFamily('grok-4.6')).toBe('grok');
    expect(resolveModelFamily('minimax-m2.5')).toBe('minimax');
    expect(resolveModelFamily('claude')).toBe('claude');
  });

  test('leaves unknown families unresolved', () => {
    expect(resolveModelFamily('mistral-large-latest')).toBeNull();
    expect(resolveModelFamily('gptkilo-1')).toBeNull();
    expect(resolveModelFamily('  CLAUDE-OPUS-5  ')).toBe('claude');
  });

  test('resolves every registered family to its relative mascot url', () => {
    for (const family of [
      'claude',
      'deepseek',
      'gemini',
      'glm',
      'gpt',
      'grok',
      'kimi',
      'qwen',
    ] as const) {
      const avatar = resolveModelAvatar(family + '-test-model');
      expect(avatar.kind).toBe('mascot');
      if (avatar.kind !== 'placeholder') {
        expect(avatar.art.src).toBe('management-assets/mascots/' + family + '.webp');
      }
    }
  });

  test('minimax keeps its lab logo and unknown models the placeholder', () => {
    expect(MODEL_FAMILY_MASCOTS.minimax).toBeUndefined();
    const minimax = resolveModelAvatar('minimax-m2.5');
    expect(minimax.kind).toBe('logo');
    expect(resolveModelAvatar('mistral-large-latest').kind).toBe('placeholder');
  });

  test('every registered mascot url is relative and its file exists under public/', () => {
    const entries = Object.entries(MODEL_FAMILY_MASCOTS);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const [, art] of entries) {
      expect(art?.src.startsWith('management-assets/mascots/')).toBe(true);
      expect(existsSync(resolve(import.meta.dir, '../public', art!.src))).toBe(true);
    }
  });

  test('prefers the registered mascot over the lab logo', () => {
    const previous = MODEL_FAMILY_MASCOTS.claude;
    const mascot: AvatarArt = { src: '/mascots/claude.svg' };
    MODEL_FAMILY_MASCOTS.claude = mascot;
    try {
      const avatar = resolveModelAvatar('claude-sonnet-5-5');
      expect(avatar.kind).toBe('mascot');
      expect(avatar.kind !== 'placeholder' && avatar.art).toBe(mascot);
    } finally {
      if (previous) MODEL_FAMILY_MASCOTS.claude = previous;
      else delete MODEL_FAMILY_MASCOTS.claude;
    }
  });
});

describe('mascot failures fall back to the lab logo', () => {
  test('a remembered broken url resolves to the lab logo until reset', () => {
    const mascotUrl = MODEL_FAMILY_MASCOTS.claude?.src;
    expect(mascotUrl).toBeDefined();
    try {
      markMascotUrlBroken(mascotUrl!);
      expect(resolveModelAvatar('claude-sonnet-5-5').kind).toBe('logo');
      // Only the broken url is remembered; other families keep their mascots.
      expect(resolveModelAvatar('gpt-5.6-luna').kind).toBe('mascot');
    } finally {
      resetMascotFailures();
    }
    expect(resolveModelAvatar('claude-sonnet-5-5').kind).toBe('mascot');
  });

  test('the award card renders the lab logo once the mascot url has failed', () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(ModelLeaderboardAwardCard, {
          metric: 'most_used',
          rows: [row(1, 'claude-sonnet-5-5', 1284, { providers: 3 })],
          runnersCollapsed: false,
        })
      );
    expect(render()).toContain('management-assets/mascots/claude.webp');
    markMascotUrlBroken(MODEL_FAMILY_MASCOTS.claude!.src);
    try {
      // The frame keeps its size; the kind flip swaps in the lab logo and its quiet tile.
      expect(render()).not.toContain('management-assets/mascots/claude.webp');
      expect(render()).toContain(String(claudeLogo));
    } finally {
      resetMascotFailures();
    }
  });
});

describe('model leaderboard layout model', () => {
  test('indexes awards by metric in contract order', () => {
    const indexed = awardsByMetric({
      start: '2026-10-16T00:00:00Z',
      end: '2026-10-23T00:00:00Z',
      awards: [
        { metric: 'speed', rows: [row(1, 'glm-5.3-flash', 184, { samples: 2931 })] },
        { metric: 'most_used', rows: [row(1, 'claude-sonnet-5-5', 1284, { providers: 3 })] },
      ],
    });
    expect(LEADERBOARD_METRICS).toEqual(['most_used', 'most_reliable', 'speed', 'most_talkative']);
    expect(indexed.most_used).toHaveLength(1);
    expect(indexed.most_reliable).toEqual([]);
    expect(indexed.speed).toHaveLength(1);
    expect(indexed.most_talkative).toEqual([]);
  });

  test('fills podium display order 2nd-1st-3rd and keeps empty slots as placeholders', () => {
    const full = podiumSlots([row(1, 'a', 3), row(2, 'b', 2), row(3, 'c', 1), row(4, 'd', 0.5)]);
    expect(full.map((slot) => (slot.kind === 'rank' ? slot.row.rank : null))).toEqual([2, 1, 3]);

    const single = podiumSlots([row(1, 'gpt-5.6-luna', 967)]);
    expect(single.map((slot) => slot.kind)).toEqual(['placeholder', 'rank', 'placeholder']);
    expect((single[1] as { kind: 'rank'; row: { model: string } }).row.model).toBe('gpt-5.6-luna');

    const pair = podiumSlots([row(1, 'a', 2), row(2, 'b', 1)]);
    expect(pair.map((slot) => slot.kind)).toEqual(['rank', 'rank', 'placeholder']);
  });

  test('runners-up only exist from the fourth rank on', () => {
    expect(runnersUpRows([row(1, 'a', 3), row(2, 'b', 2), row(3, 'c', 1)])).toEqual([]);
    const six = runnersUpRows([
      row(1, 'a', 6),
      row(2, 'b', 5),
      row(3, 'c', 4),
      row(4, 'd', 3),
      row(5, 'e', 2),
      row(6, 'f', 1),
    ]);
    expect(six.map((entry) => entry.rank)).toEqual([4, 5, 6]);
  });

  test('formats values per metric', () => {
    expect(formatLeaderboardValue('most_used', 1284, 'en')).toBe('1,284');
    expect(formatLeaderboardValue('most_reliable', 0.9997, 'en')).toBe('99.97%');
    expect(formatLeaderboardValue('speed', 184, 'en')).toBe('184');
    expect(formatLeaderboardValue('most_talkative', 38200, 'en')).toBe('38,200');
    expect(formatLeaderboardValue('most_talkative', 382000, 'en')).toBe('382K');
  });
});

describe('model leaderboard award card rendering', () => {
  const render = (
    metric: Parameters<typeof ModelLeaderboardAwardCard>[0]['metric'],
    rows: AnalyticsModelLeaderboardRow[]
  ) =>
    renderToStaticMarkup(
      createElement(ModelLeaderboardAwardCard, { metric, rows, runnersCollapsed: false })
    );

  test('shows a calm empty message for an award with no rows', () => {
    const markup = render('speed', []);
    expect(markup).toContain(
      'No model reached the 80 tok/s floor with a measurable arrival window'
    );
    expect(markup).not.toContain('1st');
    expect(markup).not.toContain('tok/s</span>');
  });

  test('renders a partial podium with placeholder slots for one row', () => {
    const markup = render('most_used', [row(1, 'gpt-5.6-luna', 967, { providers: 2 })]);
    expect(markup).toContain('gpt-5.6-luna');
    expect(markup).toContain('data-podium-placeholder');
    expect((markup.match(/data-podium-placeholder/g) ?? []).length).toBe(2);
    expect(markup).not.toContain('Runners-up');
  });

  test('shows qualified sample coverage against successful attempts', () => {
    const markup = render('speed', [row(1, 'glm-5.3-flash', 1500, { samples: 15, attempts: 100 })]);
    expect(markup).toContain('P70 observed token arrival rate');
    expect(markup).toContain('Generation-speed prediction is unavailable');
    expect(markup).toContain('15 of 100 successful requests measured');
    expect(markup).not.toContain('failed');
  });

  test('renders two ranks plus one placeholder slot', () => {
    const markup = render('most_used', [
      row(1, 'claude-sonnet-5-5', 1284, { providers: 3 }),
      row(2, 'gpt-5.6-luna', 967, { providers: 2 }),
    ]);
    expect((markup.match(/data-podium-placeholder/g) ?? []).length).toBe(1);
    expect(markup.indexOf('2nd')).toBeLessThan(markup.indexOf('1st'));
    expect(markup.indexOf('1st')).toBeLessThan(
      markup.indexOf('3rd') === -1 ? Infinity : markup.indexOf('3rd')
    );
  });

  test('hides the reasoning share when a model reported no reasoning tokens', () => {
    const markup = render('most_talkative', [
      row(1, 'gpt-5.6-luna', 38160, { samples: 2100, reasoning_share: 0.71 }),
      row(2, 'kimi-k3', 24930, { samples: 2200, reasoning_share: 0 }),
    ]);
    expect(markup).toContain('71% reasoning');
    // Zero means the provider did not break reasoning out, not that the model never reasoned.
    expect(markup).not.toContain('0% reasoning');
  });

  test('keeps three text ranks in 2nd-1st-3rd order and runners-up beside the podium', () => {
    const markup = render('most_reliable', [
      row(1, 'gemini-3-pro', 0.9997, { attempts: 9812, failed: 3 }),
      row(2, 'claude-opus-5-5', 0.9991, { attempts: 12040, failed: 11 }),
      row(3, 'deepseek-v4', 0.9962, { attempts: 5003, failed: 19 }),
      row(4, 'gpt-5.6-luna', 0.994, {}),
      row(5, 'glm-5.3-flash', 0.9885, {}),
      row(6, 'kimi-k3', 0.971, {}),
    ]);
    expect(markup).toContain('99.97%');
    expect(markup).toContain('3 of 9,812 failed');
    expect(markup.indexOf('2nd')).toBeLessThan(markup.indexOf('1st'));
    expect(markup).toContain('Runners-up');
    expect(markup).toContain('>4</span>');
    expect(markup).toContain('>6</span>');
  });

  test('runners-up collapse under the mobile breakpoint', () => {
    const markup = renderToStaticMarkup(
      createElement(ModelLeaderboardAwardCard, {
        metric: 'speed',
        rows: [
          row(1, 'glm-5.3-flash', 184, { samples: 2931 }),
          row(2, 'gemini-3-flash', 161, { samples: 4410 }),
          row(3, 'claude-haiku-5-5', 142, { samples: 1077 }),
          row(4, 'gpt-5.6-luna', 96, {}),
        ],
        runnersCollapsed: true,
      })
    );
    expect(markup).toContain('<details');
    expect(markup).not.toContain('open=""');
    expect(markup).toContain('2,931 measured');
  });
});

describe('model leaderboard navigation model', () => {
  test('routes the new page and keeps the sidebar pages unchanged', () => {
    expect(ANALYTICS_PAGES).toContain('model-leaderboard');
    expect(analyticsPageKindFromPathname('/analytics/model-leaderboard')).toBe('model-leaderboard');
    expect(analyticsPageFromPathname('/analytics/model-leaderboard')).toBe('model-leaderboard');
    expect(analyticsKindsForPage('model-leaderboard')).toEqual(['model-leaderboard']);
    // Sidebar highlighting for the existing pages stays exactly as before.
    expect(analyticsPageKindFromPathname('/analytics/overview')).toBe('overview');
    expect(analyticsPageFromPathname('/analytics/overview')).toBe('usage');
    expect(analyticsPageFromPathname('/analytics/maintenance')).toBe('management');
    // The legacy /analytics/leaderboard redirect target still resolves like a Usage path.
    expect(analyticsPageKindFromPathname('/analytics/leaderboard')).toBe('overview');
  });
});

describe('model leaderboard API adapter', () => {
  test('builds the frozen contract request with the viewer time zone', () => {
    expect(buildModelLeaderboardRequest('Asia/Bangkok')).toEqual({
      schema_version: 2,
      operation: 'model_leaderboard',
      range: { preset: 'last_n_days', n: 7 },
      time_zone: 'Asia/Bangkok',
    });
  });

  test('reads through the shared query path and normalizes the awards', async () => {
    const originalGetRaw = apiClient.getRaw;
    const getRaw = mock(async () =>
      okResponse({
        start: '2026-10-16T00:00:00Z',
        end: '2026-10-23T00:00:00Z',
        awards: [
          { metric: 'most_used', rows: [row(1, 'claude-sonnet-5-5', 1284, { providers: 3 })] },
          { metric: 'most_reliable', rows: null },
          { metric: 'speed', rows: [] },
          { metric: 'most_talkative', rows: [] },
        ],
      })
    );
    apiClient.getRaw = getRaw as unknown as typeof apiClient.getRaw;
    try {
      const data = await analyticsApi.modelLeaderboard(buildModelLeaderboardRequest('UTC'));
      expect(data.awards).toHaveLength(4);
      expect(data.awards[0]?.rows).toEqual([
        { rank: 1, model: 'claude-sonnet-5-5', value: 1284, providers: 3 },
      ]);
      expect(data.awards[1]?.rows).toEqual([]);
      // The wire form is exactly the frozen contract request (plain ASCII, so atob is enough).
      const call = getRaw.mock.calls[0]?.[1] as { headers: Record<string, string> };
      const encoded = call.headers['X-Analytics-Query'];
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const request = JSON.parse(atob(base64));
      expect(request).toEqual({
        schema_version: 2,
        operation: 'model_leaderboard',
        range: { preset: 'last_n_days', n: 7 },
        time_zone: 'UTC',
      });
    } finally {
      apiClient.getRaw = originalGetRaw;
    }
  });
});
