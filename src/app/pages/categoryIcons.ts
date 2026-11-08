import { FileImage, LayoutGrid, PenLine, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { Category } from '../router';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  organize: LayoutGrid,
  convert: FileImage,
  edit: PenLine,
  security: ShieldCheck,
  ai: Sparkles,
};
