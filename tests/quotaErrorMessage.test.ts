import { beforeAll, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { QuotaErrorMessage } from '@/features/quota/components/QuotaErrorMessage';
import type { QuotaCardState } from '@/features/quota/providers';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const message = 'Verify your account to continue.';
const render = (overrides: Partial<QuotaCardState>) =>
  renderToStaticMarkup(
    createElement(QuotaErrorMessage, {
      quota: { status: 'error', errorStatus: 403, error: message, ...overrides },
      i18nPrefix: 'antigravity_quota',
    })
  );

test('validation preserves the upstream message and offers a safe external action', () => {
  const url = 'https://accounts.google.com/signin/continue?example=1';
  const html = render({ validation: { url } });
  expect(html).toContain(message);
  expect(html).toContain(`href="${url}"`);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('Open verification link');
});

test('validation without a trusted link still shows the message', () => {
  for (const url of [undefined, 'javascript:void(0)', 'https://accounts.google.com.example.org/']) {
    const html = render({ validation: { url } });
    expect(html).toContain(message);
    expect(html).not.toContain('<a ');
  }
});

test('ordinary errors retain the provider wrapper and existing status messages', () => {
  for (const [errorStatus, expected] of [
    [403, i18n.t('common.quota_check_credential')],
    [404, i18n.t('common.quota_update_required')],
    [500, message],
  ] as const) {
    expect(render({ errorStatus })).toBe(
      i18n.t('antigravity_quota.load_failed', { message: expected })
    );
  }
});

test('the Quota page retry strip renders the verification link beside it, not inside', async () => {
  const url = 'https://accounts.google.com/signin/continue?example=1';
  const quota: QuotaCardState = { status: 'error', error: message, validation: { url } };
  const inner = renderToStaticMarkup(
    createElement(QuotaErrorMessage, {
      quota,
      i18nPrefix: 'antigravity_quota',
      showVerificationLink: false,
    })
  );
  expect(inner).toContain(message);
  expect(inner).not.toContain('<a ');
  const { QuotaVerificationLink } = await import('@/features/quota/components/QuotaErrorMessage');
  const link = renderToStaticMarkup(createElement(QuotaVerificationLink, { quota }));
  expect(link).toContain(`href="${url}"`);
  // The fork card keeps the whole failure strip as its retry button (DL088).
  const card = await Bun.file('src/features/quota/components/QuotaCard.tsx').text();
  const strip = card.split('className={styles.errorStrip}')[1].split('</button>')[0];
  expect(strip).toContain('onClick={onRefresh}');
  expect(strip).toContain('showVerificationLink={false}');
  expect(card).toContain('<QuotaVerificationLink');
});
