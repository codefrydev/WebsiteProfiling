
import { useEffect, useRef, useState } from 'react';
import { parsePortfolioAuditHistory, type PortfolioAuditHistoryPoint } from '@/lib/portfolioAuditHistory';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import type { PortfolioLoadStatus } from '@/context/portfolioContextTypes';

export function usePortfolioCardHistory(
  domainParam: string,
  enabled: boolean,
): { auditHistory: PortfolioAuditHistoryPoint[]; status: PortfolioLoadStatus } {
  const [auditHistory, setAuditHistory] = useState<PortfolioAuditHistoryPoint[]>([]);
  const [status, setStatus] = useState<PortfolioLoadStatus>('idle');
  const inFlightRef = useRef(false);

  useEffect(() => {
    setAuditHistory([]);
    setStatus('idle');
    inFlightRef.current = false;
  }, [domainParam]);

  useEffect(() => {
    if (!enabled || !domainParam) return;
    if (inFlightRef.current) return;

    let cancelled = false;
    inFlightRef.current = true;
    setStatus('loading');

    void apiFetch(apiUrl(`/report/history?domain=${encodeURIComponent(domainParam)}&limit=8`))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setAuditHistory([]);
          setStatus('error');
          return;
        }
        setAuditHistory(parsePortfolioAuditHistory(body.history || []));
        setStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) {
          setAuditHistory([]);
          setStatus('error');
        }
      })
      .finally(() => {
        if (!cancelled) inFlightRef.current = false;
      });

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [domainParam, enabled]);

  return { auditHistory, status };
}
