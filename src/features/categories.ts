/** Visual identity per tool category (accent gradient used for tiles and glows). */
import type { CSSProperties } from 'react';
import type { Category } from '../app/router';

export const CATEGORY_ACCENTS: Record<Category, { c1: string; c2: string }> = {
  organize: { c1: '#3b82f6', c2: '#06b6d4' },
  convert: { c1: '#f59e0b', c2: '#f97316' },
  edit: { c1: '#8b5cf6', c2: '#ec4899' },
  security: { c1: '#10b981', c2: '#14b8a6' },
  ai: { c1: '#6366f1', c2: '#d946ef' },
};

export function accentStyle(category: Category): CSSProperties {
  const a = CATEGORY_ACCENTS[category];
  return { ['--c1' as string]: a.c1, ['--c2' as string]: a.c2 } as CSSProperties;
}
