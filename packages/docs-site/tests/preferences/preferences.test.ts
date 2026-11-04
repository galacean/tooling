import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreferenceStorage } from '@galacean/docs-site';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPreferenceStorage', () => {
  it('isolates preference values by namespace and key', () => {
    const values = new Map<string, string>();

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const designBridge = createPreferenceStorage('design-bridge:site');
    const artis = createPreferenceStorage('artis:site');

    expect(designBridge.write('theme', 'dark')).toBe(true);
    expect(artis.write('theme', 'light')).toBe(true);
    expect(designBridge.read('theme')).toEqual({
      value: 'dark',
      failed: false,
    });
    expect(artis.read('theme')).toEqual({ value: 'light', failed: false });
    expect(values.has('design-bridge:site:theme')).toBe(true);
    expect(values.has('artis:site:theme')).toBe(true);
  });

  it('reports blocked storage without throwing', () => {
    const fail = () => {
      throw new Error('Storage blocked');
    };

    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail });
    const preferences = createPreferenceStorage('design-bridge:site');

    expect(preferences.read('locale')).toEqual({ value: null, failed: true });
    expect(preferences.write('theme', 'dark')).toBe(false);
  });

  it('rejects an empty namespace', () => {
    expect(() => createPreferenceStorage(' ')).toThrow(/non-empty string/u);
  });
});
