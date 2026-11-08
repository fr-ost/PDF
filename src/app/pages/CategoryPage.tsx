import { CATEGORY_INFO, toolsIn } from '../../features/registry';
import { accentStyle } from '../../features/categories';
import type { Category } from '../router';
import { ToolCard } from './ToolCard';
import { CATEGORY_ICONS } from './categoryIcons';

export function CategoryPage({ category }: { category: Category }) {
  const info = CATEGORY_INFO[category];
  const Icon = CATEGORY_ICONS[category];
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="enter flex items-start gap-5" style={accentStyle(category)}>
        <div className="relative">
          <div aria-hidden className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,var(--c1),var(--c2))] opacity-50 blur-xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--c1),var(--c2))] text-white ring-1 ring-white/20">
            <Icon size={24} />
          </div>
        </div>
        <div>
          <h1 className="display text-[32px] leading-tight">{info.title}</h1>
          <p className="mt-1 text-[15px] text-fg-muted">{info.description}</p>
          <p className="mt-1 text-sm text-fg-subtle">Tip: drop files straight onto a tool to open it.</p>
        </div>
      </div>
      <div className="mt-9 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {toolsIn(category).map((t, i) => (
          <ToolCard key={t.id} tool={t} index={i + 1} />
        ))}
      </div>
    </div>
  );
}
