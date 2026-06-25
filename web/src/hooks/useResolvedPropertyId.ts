import { useEffect, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';

/** Resolve an existing properties row from the audit Site URL (read-only; no create). */
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
    if (!url || !url.includes('.')) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await apiFetch(
            apiUrl(`/properties/resolve?startUrl=${encodeURIComponent(url)}`),
          );
          if (!res.ok) return;
          const data = (await res.json()) as { id?: number | null };
          if (!cancelled) {
            setResolved(data.id != null && Number.isFinite(data.id) ? Number(data.id) : null);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [explicitPropertyId, startUrl]);

  return resolved;
}
