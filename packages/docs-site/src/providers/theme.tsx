import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPreferenceStorage } from '../preferences';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  change: (mode: ThemeMode) => void;
  persist: (key: string, value: string) => boolean;
  storageError: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  namespace,
  children,
}: {
  namespace: string;
  children: ReactNode;
}) {
  const [preferences] = useState(() => createPreferenceStorage(namespace));
  const [preference, setPreference] = useState<{
    mode: ThemeMode;
    failed: boolean;
  }>(() => {
    const result = preferences.read('theme');
    const mode =
      result.value === 'dark' || result.value === 'light'
        ? result.value
        : 'system';

    return {
      mode,
      failed:
        result.failed ||
        (result.value !== null &&
          !['light', 'dark', 'system'].includes(result.value)),
    };
  });
  const { mode, failed: storageError } = preference;
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemDark(media.matches);

    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset['theme'] = resolved;
  }, [resolved]);
  const persist = (key: string, value: string) => {
    const succeeded = preferences.write(key, value);

    setPreference(current => ({ ...current, failed: !succeeded }));

    return succeeded;
  };
  const change = (value: ThemeMode) => {
    persist('theme', value);
    setPreference(current => ({ ...current, mode: value }));
  };

  return (
    <ThemeContext.Provider
      value={{ mode, resolved, change, persist, storageError }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (value === null) {
    throw new Error('Theme provider is missing');
  }

  return value;
}
