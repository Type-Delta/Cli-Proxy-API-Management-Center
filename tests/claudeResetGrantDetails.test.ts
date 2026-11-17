import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { ClaudeResetGrantDetails } from '@/features/quota/providers/claude/ClaudeResetGrantDetails';
import { bindQuotaClasses, QUOTA_CLASS_KEYS } from '@/features/quota/types';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { formatInstantShort } from '@/utils/quota';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test-host'
);
const expiry = Date.now() + 11 * 86400_000;
const grant = (overrides: Partial<AnthropicResetGrant> = {}): AnthropicResetGrant => ({
  id: 'launch',
  label: 'Launch',
  resetsTotal: 3,
  resetsLeft: 2,
  startsAt: null,
  endsAt: new Date(expiry).toISOString(),
  clears: ['five_hour'],
  paused: false,
  usableNow: true,
  useRequiresLimit: true,
  percentUsed: {},
  ...overrides,
});
const render = (grants: AnthropicResetGrant[]) =>
  renderToStaticMarkup(createElement(ClaudeResetGrantDetails, { grants, classes }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('Claude reset grant details', () => {
  test('uses the Codex reset stack with timezone, total count and live relative date', () => {
    const markup = render([grant()]);
    expect(markup).toContain('class="codexResetCredits"');
    expect(markup).toContain('codexResetCreditRow codexResetCreditStack');
    expect(markup).toContain('data-stack-count="2"');
    expect(markup).toContain(resolveTimeZoneLabel());
    expect(markup).toContain('2 resets');
    expect(markup).toContain(formatInstantShort(expiry));
    expect(markup).toContain('class="quotaResetRelative"');
    expect(markup).toContain('in 11 days');
  });

  test('stacks grants behind the soonest expiry and lists each one in the tooltip', () => {
    const fable = 'New model launch: one Fable reset for Pro and Team Standard, launch week only';
    const full = 'One full limit reset (November 2026)';
    const later = expiry + 12 * 86400_000;
    const markup = render([
      grant({
        id: 'full',
        label: full,
        resetsLeft: 1,
        resetsTotal: 1,
        resetType: 'full',
        endsAt: new Date(later).toISOString(),
      }),
      grant({ id: 'fable', label: fable, resetsLeft: 1, resetsTotal: 1, givesBackWeekly: true }),
    ]);
    const visible = markup.replace(/ (title|aria-label)="[^"]*"/g, '');
    expect(visible).toContain('2 resets');
    expect(visible).toContain(formatInstantShort(expiry));
    expect(visible).not.toContain(formatInstantShort(later));
    expect(visible).not.toContain(fable);
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain(`title="Fable reset · 1/1: ${formatInstantShort(expiry)}`);
    expect(markup.indexOf(fable)).toBeLessThan(markup.indexOf('Full reset · 1/1'));
    expect(markup).toContain(`\n${full}`);
  });

  test('a single reset is a plain row without a stack or tab stop', () => {
    const markup = render([grant({ resetsLeft: 1, resetsTotal: 1 })]);
    expect(markup).toContain('class="codexResetCreditRow  "');
    expect(markup).toContain('1 reset<');
    expect(markup).not.toContain('tabindex');
  });

  test('hides empty and spent grants', () => {
    expect(render([])).toBe('');
    expect(render([grant({ resetsLeft: 0 })])).toBe('');
    expect(render([grant(), grant({ id: 'spent', label: 'Spent', resetsLeft: 0 })])).not.toContain(
      'Spent'
    );
  });

  test('sorts by deadline without mutating input and keeps unknown dates last', () => {
    const grants = [
      grant({ id: 'unknown', label: 'Unknown', endsAt: null }),
      grant({ id: 'later', label: 'Later', endsAt: new Date(expiry + 86400_000).toISOString() }),
      grant({ id: 'first', label: 'First' }),
    ];
    const markup = render(grants);
    // Labels live in each row's tooltip, so their order is the row order.
    expect(markup.indexOf('First')).toBeLessThan(markup.indexOf('Later'));
    expect(markup.indexOf('Later')).toBeLessThan(markup.indexOf('Unknown'));
    expect(markup).toContain('Expiry unknown');
    expect(grants.map((item) => item.id)).toEqual(['unknown', 'later', 'first']);
  });

  test('keeps paused and expired unspent grants visible without implying usability', () => {
    const markup = render([
      grant({ paused: true, usableNow: false, endsAt: '2020-01-01T00:00:00Z' }),
    ]);
    expect(markup).toContain(formatInstantShort(Date.parse('2020-01-01T00:00:00Z')));
    expect(markup).not.toContain('<button');
  });

  test.each(['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'])(
    'translates kind labels in %s',
    async (lng) => {
      await i18n.changeLanguage(lng);
      try {
        const markup = render([grant({ label: '', endsAt: null, resetType: 'full' })]);
        expect(markup).toContain(i18n.t('claude_reset.kind_full'));
        expect(markup).toContain(i18n.t('claude_reset.expiry_unknown'));
        expect(markup).not.toContain('claude_reset.');
      } finally {
        await i18n.changeLanguage('en');
      }
    }
  );
});
