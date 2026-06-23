
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export function parseUrlTab<T extends string>(
  raw: string | null,
  validTabs: readonly T[],
  defaultTab: T,
): T {
  if (raw && (validTabs as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return defaultTab;
}

export function useUrlTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  paramName = 'tab',
): [T, (tab: T) => void] {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const activeTab = useMemo(
    () => parseUrlTab(searchParams.get(paramName), validTabs, defaultTab),
    [searchParams, paramName, validTabs, defaultTab],
  );

  const setActiveTab = useCallback(
    (tab: T) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === defaultTab) {
        next.delete(paramName);
      } else {
        next.set(paramName, tab);
      }
      const q = next.toString();
      navigate(q ? `${pathname}?${q}` : pathname, { replace: true, preventScrollReset: true });
    },
    [navigate, pathname, searchParams, paramName, defaultTab],
  );

  return [activeTab, setActiveTab];
}
