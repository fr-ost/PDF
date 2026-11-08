/** Theme switching with a circular reveal animation (View Transitions). */
import { prefersReducedMotion, runViewTransition } from './viewTransition';
import { updateSettings, type Settings } from '../services/settings-service/settings';

export function resolvesToDark(theme: Settings['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function setTheme(theme: Settings['theme'], origin?: { x: number; y: number }): void {
  const root = document.documentElement;
  const dark = resolvesToDark(theme);
  const apply = () => {
    root.classList.toggle('dark', dark);
    void updateSettings({ theme });
  };
  if (prefersReducedMotion() || root.classList.contains('dark') === dark) {
    apply();
    return;
  }
  root.classList.add('theme-reveal');
  const transition = runViewTransition(apply);
  if (!transition) {
    root.classList.remove('theme-reveal');
    return;
  }
  transition.ready
    .then(() => {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? 0;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => root.classList.remove('theme-reveal'));
}
