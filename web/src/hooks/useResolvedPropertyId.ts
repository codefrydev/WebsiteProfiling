
import { useEffect, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';

/** Resolve or create a properties row from the audit Site URL. */
export function useResolvedPropertyId(
  explicitPropertyId: number | null | undefined,
  startUrl: string,
): number | null {
  const [resolved, setResolved] = useState<number | null>(
    explicitPropertyId != null && Number.isFinite(explicitPropertyId)
      ? explicitPropertyId
      : null,
  );

  useEffect(() => {
    if (explicitPropertyId != null && Number.isFinite(explicitPropertyId)) {
      setResolved(explicitPropertyId);
      return;
    }
    const url = startUrl.trim();
    if (!url) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(
          apiUrl(`/properties/resolve?startUrl=${encodeURIComponent(url)}`),
        );
        if (!res.ok) return;
        const data = (await res.json()) as { id?: number };
        if (!cancelled && data.id != null) setResolved(Number(data.id));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [explicitPropertyId, startUrl]);

  return resolved;
}
