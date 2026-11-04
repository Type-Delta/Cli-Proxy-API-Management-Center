/**
 * Theme state. `data-theme` on <html> carries the mode (absent for the warm light default,
 * `white`, or `dark`) that mode-keyed component styles read; an imported palette adds
 * `data-palette` on top of its mode.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@/types';
import { STORAGE_KEY_THEME } from '@/utils/constants';
import { findThemePalette } from '@/utils/themeCatalog';

type ResolvedTheme = 'light' | 'dark';
type AppliedTheme = { mode: ResolvedTheme | 'white'; palette?: string };

interface ThemeState {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  initializeTheme: () => () => void;
}

const BUILT_IN_THEMES: readonly string[] = ['light', 'white', 'dark', 'auto'];

/** Accepts a persisted value only if it still names a theme; removed palettes fall back to auto. */
export const normalizeTheme = (theme: unknown): Theme =>
  typeof theme === 'string' && (BUILT_IN_THEMES.includes(theme) || findThemePalette(theme))
    ? (theme as Theme)
    : 'auto';

const prefersDark = () =>
  Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

export const resolveTheme = (theme: Theme, systemDark: boolean): AppliedTheme => {
  if (theme === 'auto') return { mode: systemDark ? 'dark' : 'white' };
  if (theme === 'light' || theme === 'white' || theme === 'dark') return { mode: theme };
  const palette = findThemePalette(theme);
  return { mode: palette?.mode ?? 'light', palette: palette?.id };
};

const applyTheme = ({ mode, palette }: AppliedTheme) => {
  const root = document.documentElement;
  if (mode === 'light') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  if (palette) root.setAttribute('data-palette', palette);
  else root.removeAttribute('data-palette');
};

const resolvedMode = ({ mode }: AppliedTheme): ResolvedTheme =>
  mode === 'dark' ? 'dark' : 'light';

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'auto',
      resolvedTheme: 'light',

      setTheme: (next) => {
        const theme = normalizeTheme(next);
        const applied = resolveTheme(theme, prefersDark());
        applyTheme(applied);
        set({ theme, resolvedTheme: resolvedMode(applied) });
      },

      initializeTheme: () => {
        const { theme, setTheme } = get();

        // Apply the saved theme.
        setTheme(theme);

        // Follow system changes, only in auto mode.
        if (!window.matchMedia) {
          return () => {};
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => {
          if (get().theme === 'auto') get().setTheme('auto');
        };

        mediaQuery.addEventListener('change', listener);

        return () => mediaQuery.removeEventListener('change', listener);
      },
    }),
    {
      name: STORAGE_KEY_THEME,
    }
  )
);
