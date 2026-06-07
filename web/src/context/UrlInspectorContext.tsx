'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import UrlInspectorDrawer from '@/components/UrlInspectorDrawer';

interface UrlInspectorContextValue {
  openUrl: (url: string) => void;
  close: () => void;
  activeUrl: string | null;
}

const UrlInspectorContext = createContext<UrlInspectorContextValue | null>(null);

export function useUrlInspector(): UrlInspectorContextValue {
  const ctx = useContext(UrlInspectorContext);
  if (!ctx) {
    throw new Error('useUrlInspector must be used within UrlInspectorProvider');
  }
  return ctx;
}

export function useOptionalUrlInspector(): UrlInspectorContextValue | null {
  return useContext(UrlInspectorContext);
}

export function UrlInspectorProvider({ children }: { children: ReactNode }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const openUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    if (trimmed) setActiveUrl(trimmed);
  }, []);

  const close = useCallback(() => setActiveUrl(null), []);

  const value = useMemo(
    () => ({ openUrl, close, activeUrl }),
    [openUrl, close, activeUrl],
  );

  return (
    <UrlInspectorContext.Provider value={value}>
      {children}
      <UrlInspectorDrawer url={activeUrl} onClose={close} />
    </UrlInspectorContext.Provider>
  );
}
