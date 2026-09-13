
import { useState, useCallback } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { Button } from '@/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';

export default function BingWebmasterSection() {
  const s = strings.pipelineRunner.bingWebmaster;
  const { readOnly } = useReadOnlySession();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    if (readOnly) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch(apiUrl('/integrations/bing/sync'), { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || s.failed);
      setResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.failed);
    } finally {
      setLoading(false);
    }
  }, [readOnly, s.failed]);

  return (
    <div className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container/40 p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-md-sys-on-surface flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent shrink-0" aria-hidden />
          {s.title}
        </h3>
        <p className="text-xs text-md-sys-on-surface-variant mt-1 leading-relaxed">{s.hint}</p>
      </div>
      <Button variant="secondary" onClick={() => void handleSync()} disabled={loading || readOnly}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? s.syncing : s.syncLabel}
      </Button>
      {error ? <p className="text-xs text-md-sys-error font-medium">{error}</p> : null}
      {result?.ok ? (
        <p className="text-xs text-md-sys-on-surface-variant">
          {s.success}
          {result.note ? ` ${String(result.note)}` : ''}
        </p>
      ) : null}
    </div>
  );
}
