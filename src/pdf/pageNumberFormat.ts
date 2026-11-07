/** Page number label formatting (pure). */
export type NumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type NumberFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';

export function formatPageNumber(n: number, total: number, options: { format: NumberFormat; prefix: string; suffix: string }): string {
  const core =
    options.format === 'page-n' ? `Page ${n}` : options.format === 'n-of-total' ? `${n} of ${total}` : options.format === 'page-n-of-total' ? `Page ${n} of ${total}` : `${n}`;
  return `${options.prefix}${core}${options.suffix}`;
}

