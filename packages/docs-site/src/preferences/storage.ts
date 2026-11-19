export interface PreferenceReadResult {
  value: string | null;
  failed: boolean;
}

export interface PreferenceStorage {
  read(key: string): PreferenceReadResult;
  write(key: string, value: string): boolean;
}

export interface DocsSiteStorageKeys {
  locale: string;
  theme: string;
  searchHistory: string;
}

export type DocsSiteStorageKeyOverrides = Partial<DocsSiteStorageKeys>;

export function createPreferenceStorage(): PreferenceStorage {
  return {
    read(key) {
      try {
        return {
          value: localStorage.getItem(key),
          failed: false,
        };
      } catch {
        return { value: null, failed: true };
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, value);

        return true;
      } catch {
        return false;
      }
    },
  };
}
