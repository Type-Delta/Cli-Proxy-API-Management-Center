/**
 * Imported colour palettes (from Monkeytype's open-source theme catalog), each painted on top of
 * the built-in theme for its mode. Ids match the `[data-palette]` blocks in `themes.scss`, which
 * hold the colours; this list only orders and names them for the theme picker.
 */
export const THEME_PALETTES = [
  { id: 'nord', label: 'Nord', mode: 'dark' },
  { id: 'iceberg-dark', label: 'Iceberg Dark', mode: 'dark' },
  { id: 'catppuccin', label: 'Catppuccin', mode: 'dark' },
  { id: 'dracula', label: 'Dracula', mode: 'dark' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', mode: 'dark' },
  { id: 'rose-pine', label: 'Rosé Pine', mode: 'dark' },
  { id: 'mashu', label: 'Mashu', mode: 'dark' },
  { id: 'midnight', label: 'Midnight', mode: 'dark' },
  { id: 'terra', label: 'Terra', mode: 'dark' },
  { id: 'fledgling', label: 'Fledgling', mode: 'dark' },
  { id: 'rose-pine-dawn', label: 'Rosé Pine Dawn', mode: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light' },
  { id: 'gruvbox-light', label: 'Gruvbox Light', mode: 'light' },
  { id: 'iceberg-light', label: 'Iceberg Light', mode: 'light' },
  { id: 'lilac-mist', label: 'Lilac Mist', mode: 'light' },
] as const;

export type ThemePalette = (typeof THEME_PALETTES)[number];
export type ThemePaletteId = ThemePalette['id'];

export const findThemePalette = (id: string): ThemePalette | undefined =>
  THEME_PALETTES.find((palette) => palette.id === id);
