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
  /** Open a URL in the inspector, pushing it onto the navigation trail. */
  openUrl: (url: string) => void;
  /** Close the inspector and clear the trail. */
  close: () => void;
  /** Step back to the previously inspected URL. */
  back: () => void;
  /** Step forward (redo) after going back. */
  forward: () => void;
  /** Jump to a specific trail index (used by the breadcrumb). */
  goTo: (index: number) => void;
  /** The URL currently shown, or null when the inspector is closed. */
  activeUrl: string | null;
  /** The path of URLs visited up to (and including) the current one. */
  trail: string[];
  canGoBack: boolean;
  canGoForward: boolean;
}

interface NavState {
  entries: string[];
  cursor: number;
}

const INITIAL: NavState = { entries: [], cursor: -1 };

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
  const [nav, setNav] = useState<NavState>(INITIAL);

  const openUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setNav((prev) => {
      const current = prev.cursor >= 0 ? prev.entries[prev.cursor] : null;
      if (trimmed === current) return prev;
      // Drop any forward (redo) entries, then push the new URL.
      const kept = prev.entries.slice(0, prev.cursor + 1);
      kept.push(trimmed);
      return { entries: kept, cursor: kept.length - 1 };
    });
  }, []);

  const close = useCallback(() => setNav(INITIAL), []);

  const back = useCallback(
    () => setNav((p) => (p.cursor > 0 ? { ...p, cursor: p.cursor - 1 } : p)),
    [],
  );

  const forward = useCallback(
    () => setNav((p) => (p.cursor < p.entries.length - 1 ? { ...p, cursor: p.cursor + 1 } : p)),
    [],
  );

  const goTo = useCallback(
    (index: number) =>
      setNav((p) => (index >= 0 && index < p.entries.length ? { ...p, cursor: index } : p)),
    [],
  );

  const activeUrl = nav.cursor >= 0 ? nav.entries[nav.cursor] ?? null : null;
  const trail = useMemo(() => nav.entries.slice(0, nav.cursor + 1), [nav]);
  const canGoBack = nav.cursor > 0;
  const canGoForward = nav.cursor < nav.entries.length - 1;

  const value = useMemo(
    () => ({ openUrl, close, back, forward, goTo, activeUrl, trail, canGoBack, canGoForward }),
    [openUrl, close, back, forward, goTo, activeUrl, trail, canGoBack, canGoForward],
  );

  return (
    <UrlInspectorContext.Provider value={value}>
      {children}
      <UrlInspectorDrawer url={activeUrl} onClose={close} />
    </UrlInspectorContext.Provider>
  );
}
