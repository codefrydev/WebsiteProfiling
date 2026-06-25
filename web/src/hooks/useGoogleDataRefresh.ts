import { useCallback, useEffect, useRef, useState } from 'react';
import { useReport } from '@/context/useReport';
import { usePropertyForDomain } from '@/lib/dashboard/hooks/usePropertyForDomain';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { dispatchPipelineJobStarted, pollPipelineJob } from '@/lib/pipelineJobEvents';
import { googleSnapshotStatus } from '@/lib/googleSnapshot';

export type GoogleDataRefreshResult = { ok: true; message: string } | { ok: false; message: string };

export function useGoogleDataRefresh() {
  const { reloadSection, selectedReportId, data } = useReport();
  const { propertyId, ready: propertyReady } = usePropertyForDomain();
  const { readOnly, loading: sessionLoading } = useReadOnlySession();
  const [refreshing, setRefreshing] = useState(false);
  const pollStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      pollStopRef.current?.();
      pollStopRef.current = null;
    };
  }, []);

  const snapshot = googleSnapshotStatus(data?.google);

  const refresh = useCallback(async (): Promise<GoogleDataRefreshResult> => {
    if (sessionLoading) {
      return { ok: false, message: 'Session loading…' };
    }
    if (readOnly) {
      return { ok: false, message: 'readOnly' };
    }
    if (!propertyReady) {
      return { ok: false, message: 'Property loading…' };
    }
    if (propertyId == null) {
      return { ok: false, message: 'noProperty' };
    }

    pollStopRef.current?.();
    pollStopRef.current = null;
    setRefreshing(true);

    try {
      const res = await apiFetch(apiUrl('/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'google',
          propertyId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok) {
        return { ok: false, message: body.error || 'Fetch failed' };
      }

      const jobId = body.jobId;
      if (!jobId) {
        return { ok: false, message: 'No job id returned' };
      }

      dispatchPipelineJobStarted(jobId, { command: 'google', openRunner: false });

      return await new Promise<GoogleDataRefreshResult>((resolve) => {
        pollStopRef.current = pollPipelineJob(jobId, (job) => {
          if (job.status === 'success') {
            void reloadSection('traffic', selectedReportId).finally(() => {
              setRefreshing(false);
              resolve({ ok: true, message: 'success' });
            });
          } else if (job.status === 'error') {
            setRefreshing(false);
            const excerpt = (job.log || job.error || 'Google fetch failed').trim().slice(-400);
            resolve({ ok: false, message: excerpt || 'Google fetch failed' });
          }
        });
      });
    } catch (e) {
      setRefreshing(false);
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }
  }, [sessionLoading, readOnly, propertyReady, propertyId, reloadSection, selectedReportId]);

  return {
    refresh,
    refreshing,
    readOnly: sessionLoading || readOnly,
    propertyReady,
    propertyId,
    stale: snapshot.stale,
  };
}
