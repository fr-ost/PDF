import { CATEGORY_INFO, toolsIn } from '../../features/registry';
import type { Category } from '../router';
import { ToolCard } from './ToolCard';

export function CategoryPage({ category }: { category: Category }) {
  const info = CATEGORY_INFO[category];
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{info.title}</h1>
      <p className="mt-1 text-fg-muted">{info.description}</p>
      <p className="mt-1 text-sm text-fg-subtle">Tip: drop files straight onto a tool to open it.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {toolsIn(category).map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </div>
    </div>
  );
}
