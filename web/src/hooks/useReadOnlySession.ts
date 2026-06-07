'use client';

import { useSession } from '@/context/SessionContext';

/** True when auth is on and the session cannot mutate (viewer / client-readonly). */
export function useReadOnlySession(): { loading: boolean; readOnly: boolean } {
  const { loading, canMutate } = useSession();
  return { loading, readOnly: !canMutate };
}
