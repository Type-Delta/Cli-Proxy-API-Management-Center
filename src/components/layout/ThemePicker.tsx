import { useId, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '@/types';
import { THEME_PALETTES } from '@/utils/themeCatalog';

type Swatch = { page: string; text: string; main: string; sub: string };

/** Built-in themes keep their swatch colours here; imported palettes read theirs from CSS. */
const BUILT_IN: Array<{ key: Theme; labelKey: string; swatch: Swatch }> = [
  {
    key: 'auto',
    labelKey: 'theme.auto',
    swatch: {
      page: 'linear-gradient(115deg, #ffffff 0 50%, #151412 50% 100%)',
      text: '#ffffff',
      main: '#8b8680',
      sub: '#9c958d',
    },
  },
  {
    key: 'white',
    labelKey: 'theme.white',
    swatch: { page: '#ffffff', text: '#2d2a26', main: '#8b8680', sub: '#c0bab3' },
  },
  {
    key: 'light',
    labelKey: 'theme.light',
    swatch: { page: '#faf9f5', text: '#2d2a26', main: '#8b8680', sub: '#c0bab3' },
  },
  {
    key: 'dark',
    labelKey: 'theme.dark',
    swatch: { page: '#151412', text: '#f6f4f1', main: '#8b8680', sub: '#6f6962' },
  },
];

const swatchStyle = ({ page, text, main, sub }: Swatch) =>
  ({
    '--palette-page': page,
    '--palette-text': text,
    '--palette-main': main,
    '--palette-sub': sub,
  }) as CSSProperties;

const GROUPS = [
  { mode: 'light', labelKey: 'theme.group_light' },
  { mode: 'dark', labelKey: 'theme.group_dark' },
] as const;

type ChipProps = {
  label: string;
  active: boolean;
  onSelect: () => void;
  palette?: string;
  style?: CSSProperties;
  auto?: boolean;
};

/** Painted in its own colours: page background, name in its text colour, accent/sub/text dots. */
function ThemeChip({ label, active, onSelect, palette, style, auto }: ChipProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={`theme-chip${active ? ' active' : ''}${auto ? ' auto' : ''}`}
      data-palette={palette}
      style={style}
      onClick={onSelect}
      title={label}
    >
      <span className="theme-chip-name">{label}</span>
      <span className="theme-chip-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

/** A labelled set of chips inside the theme menu. */
function ThemeGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="theme-picker-group" role="group" aria-labelledby={id}>
      <div className="theme-picker-heading" id={id}>
        {label}
      </div>
      <div className="theme-picker-grid">{children}</div>
    </div>
  );
}

/** Theme menu contents: CPAMC's built-in themes, then the imported palettes by mode. */
export function ThemePicker({ theme, onSelect }: { theme: Theme; onSelect: (t: Theme) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <ThemeGroup label={t('theme.group_default')}>
        {BUILT_IN.map((item) => (
          <ThemeChip
            key={item.key}
            label={t(item.labelKey)}
            active={theme === item.key}
            onSelect={() => onSelect(item.key)}
            style={swatchStyle(item.swatch)}
            auto={item.key === 'auto'}
          />
        ))}
      </ThemeGroup>
      {GROUPS.map((group) => (
        <ThemeGroup key={group.mode} label={t(group.labelKey)}>
          {THEME_PALETTES.filter((palette) => palette.mode === group.mode).map((palette) => (
            <ThemeChip
              key={palette.id}
              label={palette.label}
              active={theme === palette.id}
              onSelect={() => onSelect(palette.id)}
              palette={palette.id}
            />
          ))}
        </ThemeGroup>
      ))}
    </>
  );
}
