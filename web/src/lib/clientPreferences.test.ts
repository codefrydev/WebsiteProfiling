import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectLegacyLocalStorageUplift,
  DEFAULT_CLIENT_PREFERENCES,
  normalizeClientPreferences,
} from '@/lib/clientPreferences';

function mockLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe('clientPreferences', () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it('normalizes API DTO with defaults for invalid values', () => {
    const prefs = normalizeClientPreferences({
      defaultLandingView: 'not-a-view',
      chatFabCorner: 'center',
      networkViewMode: '4d',
      radiusScale: 'huge',
    });
    expect(prefs).toEqual(DEFAULT_CLIENT_PREFERENCES);
  });

  it('collects legacy localStorage uplift when DB is at defaults', () => {
    localStorage.setItem('wp-default-view:v1', 'issues');
    localStorage.setItem('wp-chat-fab-position:v1', JSON.stringify({ corner: 'top-left' }));
    localStorage.setItem('network-view-mode', '3d');
    localStorage.setItem('wp-ui-prefs:v1', JSON.stringify({ radius: 'pill', animations: false }));

    const uplift = collectLegacyLocalStorageUplift(DEFAULT_CLIENT_PREFERENCES);
    expect(uplift).toEqual({
      defaultLandingView: 'issues',
      chatFabCorner: 'top-left',
      networkViewMode: '3d',
      radiusScale: 'pill',
      animationsEnabled: false,
    });
  });

  it('skips uplift when DB already has non-default values', () => {
    localStorage.setItem('network-view-mode', '3d');
    const db = normalizeClientPreferences({ networkViewMode: '3d' });
    expect(collectLegacyLocalStorageUplift(db)).toEqual({});
  });
});
