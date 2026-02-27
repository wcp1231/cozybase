import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'cz-theme-mode';

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));

  return { mode, setMode, toggle };
}
