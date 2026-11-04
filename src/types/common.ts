/**
 * Shared type definitions
 */

import type { ThemePaletteId } from '@/utils/themeCatalog';

/** A built-in theme, `auto` (white or dark by system preference), or an imported palette. */
export type Theme = 'light' | 'white' | 'dark' | 'auto' | ThemePaletteId;

export type Language = 'zh-CN' | 'zh-TW' | 'en' | 'ru' | 'vi' | 'ko' | 'tr';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}
