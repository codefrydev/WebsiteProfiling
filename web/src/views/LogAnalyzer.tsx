
import { useState } from 'react';
import { Terminal, Upload } from 'lucide-react';
import { useOptionalPipeline } from '@/context/PipelineContext';
import { useReport } from '@/context/useReport';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { PageLayout, PageHeader, Card, StatCard, Button, AlertBanner, EmptyState } from '@/components';
import type { ViewProps } from '@/types';

const vl = strings.views.logAnalyzer;

interface CrawlCompare {
  log_only_paths?: string[];
  crawl_only_paths?: string[];
  log_only_count?: number;
  crawl_only_count?: number;
}

function PathList({ title, paths, hint }: { title: string; paths: string[]; hint: string }) {
  const sample = paths.slice(0, 50);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {sample.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-default bg-brand-900/30 p-2 text-xs font-mono space-y-1">
          {sample.map((path) => (
            <li key={path} className="truncate" title={path}>
              {path}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{vl.emptyList}</p>
      )}
    </div>
  );
}

export default function LogAnalyzer(_props: ViewProps) {
  const pipeline = useOptionalPipeline();
  const { data } = useReport();
  const propertyId = Number(pipeline?.configState.active_property_id || 0);
  const startUrl = String(pipeline?.configState.start_url || data?.site_name || '');
  const crawlUrls = (data?.links || []).map((l) => String(l.url || '')).filter(Boolean).slice(0, 5000);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);

  const handleUpload = async () => {
    if (!propertyId || !file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('propertyId', String(propertyId));
      form.append('file', file);
      if (startUrl) form.append('startUrl', startUrl);
      if (crawlUrls.length) form.append('crawlUrls', crawlUrls.join('\n'));
      const res = await apiFetch(apiUrl('/logs/upload'), { method: 'POST', body: form });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Upload failed');
      setAnalysis((payload.analysis || null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const compare = (analysis?.crawl_compare || null) as CrawlCompare | null;
  const logOnlyPaths =
    compare?.log_only_paths ||
    (Array.isArray(analysis?.log_only_paths) ? (analysis.log_only_paths as string[]) : []);
  const crawlOnlyPaths =
    compare?.crawl_only_paths ||
    (Array.isArray(analysis?.crawl_only_paths) ? (analysis.crawl_only_paths as string[]) : []);

  return (
    <PageLayout>
      <PageHeader
        title={vl.title}
        subtitle={vl.subtitle}
        icon={<Terminal className="h-7 w-7 text-link shrink-0" />}
      />
      {!propertyId ? (
        <EmptyState
          icon={Terminal}
          title={vl.title}
          description={vl.noProperty}
        />
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".log,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-default file:text-xs file:font-semibold file:bg-brand-700/80 file:text-foreground hover:file:bg-brand-700 cursor-pointer"
            />
            <Button
              variant="primary"
              disabled={!file || busy}
              loading={busy}
              onClick={() => void handleUpload()}
            >
              <Upload className="h-4 w-4" />
              {busy ? strings.app.loading : vl.upload}
            </Button>
          </div>
          {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
          {analysis ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard
                  label={vl.parsedLines}
                  value={Number(analysis.parsed_lines || 0).toLocaleString()}
                  hint={metricHelpHint('views.logAnalyzer.parsedLines')}
                />
                <StatCard
                  label={vl.uniquePaths}
                  value={Number(analysis.unique_paths || 0).toLocaleString()}
                  hint={metricHelpHint('views.logAnalyzer.uniquePaths')}
                />
                <StatCard
                  label={vl.googlebotHits}
                  value={Number(analysis.googlebot_hits || 0).toLocaleString()}
                  hint={metricHelpHint('views.logAnalyzer.googlebotHits')}
                />
                <StatCard
                  label={vl.logOnlyUrls}
                  value={Number(compare?.log_only_count ?? logOnlyPaths.length).toLocaleString()}
                  hint={metricHelpHint('views.logAnalyzer.logOnly')}
                />
                <StatCard
                  label={vl.crawlOnlyUrls}
                  value={Number(compare?.crawl_only_count ?? crawlOnlyPaths.length).toLocaleString()}
                  hint={metricHelpHint('views.logAnalyzer.crawlOnly')}
                />
              </div>
              {(logOnlyPaths.length > 0 || crawlOnlyPaths.length > 0) ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PathList title={vl.logOnlyListTitle} paths={logOnlyPaths} hint={vl.listHint} />
                  <PathList title={vl.crawlOnlyListTitle} paths={crawlOnlyPaths} hint={vl.listHint} />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}
    </PageLayout>
  );
}
