import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { ToggleRow } from '../src/features/config/components/fields/FieldPrimitives';

describe('toggle switch accessibility', () => {
  test('associates each toggle description with its checkbox', () => {
    const markup = renderToStaticMarkup(
      createElement(ToggleRow, {
        title: 'OAuth safeguard',
        description: 'Blocks direct OAuth requests when capture is missing or stale.',
        checked: false,
        onChange: () => {},
      })
    );
    const describedById = markup.match(/aria-describedby="([^"]+)"/)?.[1];

    expect(markup).toContain('aria-label="OAuth safeguard"');
    expect(describedById).toBeDefined();
    expect(markup).toContain(`id="${describedById}"`);
    expect(markup).toContain('Blocks direct OAuth requests when capture is missing or stale.');
  });

  test('shows a visible outline on the switch track for keyboard focus', () => {
    const stylesheet = readFileSync(
      join(import.meta.dir, '../src/components/ui/ToggleSwitch.module.scss'),
      'utf8'
    );

    expect(stylesheet).toContain('.root input:focus-visible + .track');
    expect(stylesheet).toContain('outline: 2px solid var(--primary-color)');
  });
});
