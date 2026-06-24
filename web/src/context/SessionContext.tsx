
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';

export interface SessionState {
  loading: boolean;
  authEnabled: boolean;
  authenticated: boolean;
  role: string | null;
  canMutate: boolean;
  readonly: boolean;
}

const defaultState: SessionState = {
  loading: true,
  authEnabled: false,
  authenticated: true,
  role: 'analyst',
  canMutate: true,
  readonly: false,
};

const SessionContext = createContext<SessionState>(defaultState);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(apiUrl('/auth/session'))
      .then((res) => res.json())
      .then((data: Partial<SessionState>) => {
        if (cancelled) return;
        setState({
          loading: false,
          authEnabled: Boolean(data.authEnabled),
          authenticated: data.authenticated !== false,
          role: typeof data.role === 'string' ? data.role : null,
          canMutate: data.canMutate !== false,
          readonly: Boolean(data.readonly),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
