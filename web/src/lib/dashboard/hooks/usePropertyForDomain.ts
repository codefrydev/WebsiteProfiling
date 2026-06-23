'use client';

import { useEffect, useState } from 'react';
import { useReport } from '@/context/useReport';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import { apiUrl, apiFetch } from '@/lib/publicBase';

interface PropertyRow {
  id: number;
  name?: string;
  canonical_domain?: string;
}

function norm(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
}

/**
 * Resolve the property whose dashboards we read/write, keyed by the `?domain=`
 * URL param (via ReportContext.domainSlug). Falls back to the pipeline's active
 * property, then the first property in the DB.
 */
export function usePropertyForDomain(): { propertyId: number | null; ready: boolean } {
  const { domainSlug } = useReport();
  const { propertyId: configPropertyId, contextReady } = useActivePropertyContext();
  const [resolved, setResolved] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDone(false);
    apiFetch(apiUrl('/properties'))
      .then((r) => r.json())
      .then((d: { properties?: PropertyRow[] }) => {
        if (cancelled) return;
        const props = d.properties ?? [];
        const want = norm(domainSlug);
        const match = want
          ? props.find((p) => {
              const cd = norm(p.canonical_domain);
              return cd === want || cd.includes(want) || want.includes(cd);
            })
          : undefined;
        setResolved(match?.id ?? configPropertyId ?? props[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setResolved(configPropertyId ?? null);
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [domainSlug, configPropertyId]);

  return { propertyId: resolved, ready: contextReady && done };
}
