import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { TablePagination } from '@/features/analytics/components/TablePagination';

test('clamps table page and row labels before rendering after a collection shrinks', async () => {
  await i18n.changeLanguage('en');
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(TablePagination, { currentPage: 3, totalItems: 51, onPageChange: () => {} })
    )
  );
  expect(html).toContain('Showing 51–51 of 51');
  expect(html).toContain('Page 2 of 2');
  expect(html).not.toContain('101');
});
