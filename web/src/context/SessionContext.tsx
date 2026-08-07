
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

/** Fail-closed defaults: deny access until /auth/session succeeds. */
export const defaultState: SessionState = {
  loading: true,
  authEnabled: false,
  authenticated: false,
  role: null,
  canMutate: false,
  readonly: true,
};

export const unauthenticatedState: SessionState = {
  loading: false,
  authEnabled: false,
  authenticated: false,
  role: null,
  canMutate: false,
  readonly: true,
};

/** Map a successful /auth/session JSON body into SessionState. */
export function sessionStateFromResponse(data: Partial<SessionState>): SessionState {
  return {
    loading: false,
    authEnabled: Boolean(data.authEnabled),
    authenticated: data.authenticated === true,
    role: typeof data.role === 'string' ? data.role : null,
    canMutate: data.canMutate === true,
    readonly: Boolean(data.readonly),
  };
}

const SessionContext = createContext<SessionState>(defaultState);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(apiUrl('/auth/session'))
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState(unauthenticatedState);
          return;
        }
        const data = (await res.json()) as Partial<SessionState>;
        if (!cancelled) setState(sessionStateFromResponse(data));
      })
      .catch(() => {
        if (!cancelled) {
          setState(unauthenticatedState);
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
