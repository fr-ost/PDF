import { useEffect } from 'react';
import { useSettings } from '../services/settings-service/settings';

/** Applies the selected theme (or the system preference) to <html>. */
export function useApplyTheme(): void {
  const { theme } = useSettings();
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
