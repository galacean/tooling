import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreferenceStorage } from '@galacean/docs-site';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPreferenceStorage', () => {
  it('reads and writes complete localStorage keys as provided', () => {
    const values = new Map<string, string>();

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const preferences = createPreferenceStorage();

    expect(preferences.write('umi_locale', 'zh-CN')).toBe(true);
    expect(preferences.write('docs-theme', 'dark')).toBe(true);
    expect(preferences.read('umi_locale')).toEqual({
      value: 'zh-CN',
      failed: false,
    });
    expect(values.get('docs-theme')).toBe('dark');
  });

  it('reports blocked storage without throwing', () => {
    const fail = () => {
      throw new Error('Storage blocked');
    };

    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail });
    const preferences = createPreferenceStorage();

    expect(preferences.read('umi_locale')).toEqual({
      value: null,
      failed: true,
    });
    expect(preferences.write('docs-theme', 'dark')).toBe(false);
  });
});
