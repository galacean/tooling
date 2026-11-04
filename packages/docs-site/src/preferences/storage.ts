export interface PreferenceReadResult {
  value: string | null;
  failed: boolean;
}

export interface PreferenceStorage {
  read(key: string): PreferenceReadResult;
  write(key: string, value: string): boolean;
}

export function createPreferenceStorage(namespace: string): PreferenceStorage {
  if (namespace.trim() === '') {
    throw new Error('Preference namespace must be a non-empty string');
  }

  return {
    read(key) {
      try {
        return {
          value: localStorage.getItem(`${namespace}:${key}`),
          failed: false,
        };
      } catch {
        return { value: null, failed: true };
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(`${namespace}:${key}`, value);

        return true;
      } catch {
        return false;
      }
    },
  };
}
