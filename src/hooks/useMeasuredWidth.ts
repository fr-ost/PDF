import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Width of an element (content box), kept current with a ResizeObserver.
 * Returns a callback ref, so it also works for elements rendered later.
 * Widths are rounded down to 8 px steps to avoid re-rendering on every pixel.
 */
export function useMeasuredWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useLayoutEffect(() => {
    if (!el) return;
    const update = () => {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setWidth(Math.max(0, Math.floor(inner / 8) * 8));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [ref, width];
}
