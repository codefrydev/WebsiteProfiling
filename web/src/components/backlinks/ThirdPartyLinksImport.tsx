
import { useRef, useState, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { Button } from '@/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { useOptionalPipeline } from '@/context/PipelineContext';
import type { GscTopLinkingSiteRow } from '@/types/components';

type ProviderId = 'moz' | 'majestic';

interface ThirdPartyOverlay {
  provider?: string;
  provenance?: string;
  referring_domain_count?: number;
  domains_not_in_gsc_count?: number;
  domains_not_in_gsc_sample?: string[];
  gsc_domains_not_in_third_party_count?: number;
  imported_at?: string;
}

interface GscLinksLike {
  top_linking_sites?: GscTopLinkingSiteRow[];
  third_party_overlays?: ThirdPartyOverlay[];
}

export interface ThirdPartyLinksImportProps {
  gscLinks?: GscLinksLike;
  onImported?: () => void;
}

export default function ThirdPartyLinksImport({ gscLinks, onImported }: ThirdPartyLinksImportProps) {
  const s = strings.views.backlinks.thirdPartyImport;
  const pipeline = useOptionalPipeline();
  const propertyId = Number(pipeline?.configState.active_property_id || 0);
  const { readOnly } = useReadOnlySession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<ProviderId>('moz');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOverlay, setLastOverlay] = useState<ThirdPartyOverlay | null>(null);

  const ourDomains = (gscLinks?.top_linking_sites || [])
    .map((row) => String(row.site || '').trim().toLowerCase())
    .filter(Boolean);

  const savedOverlays = gscLinks?.third_party_overlays || [];

  const handleFile = useCallback(
    async (file: File) => {
      if (readOnly || !propertyId) return;
      setLoading(true);
      setError(null);
      try {
        const csvText = await file.text();
        const res = await apiFetch(apiUrl('/backlinks/third-party-import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, provider, csvText, ourDomains }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || s.failed);
        const overlay = (payload.overlay || null) as ThirdPartyOverlay | null;
        setLastOverlay(overlay);
        onImported?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : s.failed);
      } finally {
        setLoading(false);
      }
    },
    [propertyId, provider, ourDomains, readOnly, onImported, s.failed],
  );

  if (!propertyId) {
    return (
      <p className="text-xs text-muted-foreground mb-6">{s.noProperty}</p>
    );
  }

  const displayOverlays = lastOverlay
    ? [...savedOverlays.filter((o) => o.provider !== lastOverlay.provider), lastOverlay]
    : savedOverlays;

  return (
    <div className="mb-6 p-4 rounded-xl border border-default bg-brand-800/50 space-y-3">
      <h3 className="text-sm font-bold text-foreground">{s.title}</h3>
      <p className="text-xs text-muted-foreground">{s.hint}</p>
      <div className="flex flex-wrap gap-2">
        {(['moz', 'majestic'] as const).map((id) => (
          <button
            key={id}
            type="button"
            disabled={readOnly}
            onClick={() => setProvider(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              provider === id
                ? 'border-accent bg-accent/15 text-foreground'
                : 'border-default text-muted-foreground hover:text-foreground'
            }`}
          >
            {id === 'moz' ? s.mozLabel : s.majesticLabel}
          </button>
        ))}
      </div>
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
      <Button
        variant="secondary"
        disabled={loading || readOnly}
        onClick={() => fileRef.current?.click()}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {loading ? s.uploading : s.uploadLabel}
      </Button>
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}
      {displayOverlays.length > 0 ? (
        <div className="space-y-3 pt-2 border-t border-muted">
          {displayOverlays.map((overlay) => (
            <div key={overlay.provider || overlay.imported_at} className="text-xs space-y-1">
              <p className="font-semibold text-foreground">
                {(overlay.provider || 'unknown').toUpperCase()} — {overlay.provenance || s.estimated}
              </p>
              <p className="text-muted-foreground">
                {format(s.summary, {
                  count: overlay.referring_domain_count ?? 0,
                  gaps: overlay.domains_not_in_gsc_count ?? 0,
                })}
              </p>
              {(overlay.domains_not_in_gsc_sample || []).length > 0 ? (
                <ul className="font-mono text-[11px] max-h-24 overflow-y-auto space-y-0.5">
                  {(overlay.domains_not_in_gsc_sample || []).slice(0, 15).map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
