'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiUrl } from '@/lib/publicBase';
import type { NavItemId } from '@/lib/appNav';

/** Maps a NavItemId to its feature_* pipeline_config key. */
const FEATURE_KEY_MAP: Partial<Record<NavItemId, string>> = {
  pipeline: 'feature_pipeline_enabled',
  write: 'feature_write_enabled',
  'pages-md': 'feature_pages_md_enabled',
  chat: 'feature_chat_enabled',
  mcp: 'feature_mcp_visible',
  secrets: 'feature_secrets_visible',
};

interface RiskFeaturesState {
  featureEnabled: (id: NavItemId) => boolean;
  loading: boolean;
  refresh: () => void;
}

const defaultState: RiskFeaturesState = {
  featureEnabled: () => true,
  loading: true,
  refresh: () => {},
};

const RiskFeaturesContext = createContext<RiskFeaturesState>(defaultState);

export function useRiskFeatures(): RiskFeaturesState {
  return useContext(RiskFeaturesContext);
}

export function RiskFeaturesProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(apiUrl('/secrets'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { state?: Record<string, string | boolean> } | null) => {
        if (cancelled || !data?.state) return;
        const out: Record<string, boolean> = {};
        for (const [navId, key] of Object.entries(FEATURE_KEY_MAP)) {
          const val = data.state[key!];
          out[navId] = val !== 'false' && val !== false;
        }
        setFlags(out);
      })
      .catch(() => {/* defaults: all enabled */})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  function refresh() {
    setTick((n) => n + 1);
  }

  function featureEnabled(id: NavItemId): boolean {
    if (!(id in FEATURE_KEY_MAP)) return true;
    return flags[id] !== false;
  }

  return (
    <RiskFeaturesContext.Provider value={{ featureEnabled, loading, refresh }}>
      {children}
    </RiskFeaturesContext.Provider>
  );
}

export { FEATURE_KEY_MAP };
