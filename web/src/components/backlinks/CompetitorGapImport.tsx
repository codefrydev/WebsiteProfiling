
import { useRef, useState, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { Button } from '@/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import type { GscTopLinkingSiteRow } from '@/types/components';

interface GscLinksLike {
  top_linking_sites?: GscTopLinkingSiteRow[];
}

interface GapResult {
  competitor?: string;
  gap_count?: number;
  gap_domains?: string[];
  competitor_referring_count?: number;
  provenance?: string;
}

export interface CompetitorGapImportProps {
  gscLinks?: GscLinksLike;
}

export default function CompetitorGapImport({ gscLinks }: CompetitorGapImportProps) {
  const s = strings.views.backlinks.competitorImport;
  const { readOnly } = useReadOnlySession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [competitor, setCompetitor] = useState('');
  const [loading, setLoading] = useState(false);
  const [gap, setGap] = useState<GapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ourDomains = (gscLinks?.top_linking_sites || [])
    .map((row: GscTopLinkingSiteRow) => String(row.site || '').trim().toLowerCase())
    .filter(Boolean);

  const handleFile = useCallback(
    async (file: File) => {
      if (readOnly) return;
      const comp = competitor.trim();
      if (!comp) {
        setError(s.competitorRequired);
        return;
      }
      setLoading(true);
      setError(null);
      setGap(null);
      try {
        const csvText = await file.text();
        const res = await apiFetch(apiUrl('/backlinks/competitor-import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitor: comp, csvText, ourDomains }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || s.failed);
        setGap((payload.gap || null) as GapResult | null);
      } catch (e) {
        setError(e instanceof Error ? e.message : s.failed);
      } finally {
        setLoading(false);
      }
    },
    [competitor, ourDomains, readOnly, s.competitorRequired, s.failed],
  );

  return (
    <div className="mb-6 p-4 rounded-xl border border-default bg-brand-800/50 space-y-3">
      <h3 className="text-sm font-bold text-foreground">{s.title}</h3>
      <p className="text-xs text-muted-foreground">{s.hint}</p>
      <input
        type="text"
        value={competitor}
        onChange={(e) => setCompetitor(e.target.value)}
        placeholder={s.competitorPlaceholder}
        disabled={readOnly}
        className="w-full max-w-md rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground disabled:opacity-60"
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={readOnly}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button variant="secondary" disabled={loading || readOnly} onClick={() => fileRef.current?.click()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {loading ? s.uploading : s.uploadLabel}
      </Button>
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}
      {gap?.gap_count != null && gap.gap_count > 0 ? (
        <div className="text-xs space-y-1">
          <p className="text-muted-foreground">
            {format(s.gapSummary, {
              count: gap.gap_count,
              competitor: gap.competitor || competitor,
            })}
          </p>
          <ul className="font-mono text-[11px] text-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(gap.gap_domains || []).slice(0, 20).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : gap ? (
        <p className="text-xs text-muted-foreground">{s.noGap}</p>
      ) : null}
    </div>
  );
}
