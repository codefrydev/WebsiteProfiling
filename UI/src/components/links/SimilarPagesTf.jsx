import { useMemo, useState, useCallback } from 'react';
import { Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { useReport } from '../../context/useReport';
import { strings, format } from '../../lib/strings';
import { queryCrawlResults } from '../../lib/loadReportDb';
import {
  loadPipeline,
  DEFAULT_EMBEDDING_MODEL,
  createProgressAggregator,
  combinePageText,
  vecFromOutput,
  cosineSim,
} from '../../lib/transformersClient';

/** Browser-side embedding similarity vs other crawled URLs (and optional SQL crawl rows). */
export default function SimilarPagesTf({ link, allLinks = [] }) {
  const sp = strings.components.similarPages;
  const { sqlDb } = useReport();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadProgress, setLoadProgress] = useState({ overall: 0, currentFile: '' });

  const candidates = useMemo(() => {
    const u = (link?.url || '').replace(/\/$/, '');
    const list = Array.isArray(allLinks) ? allLinks : [];
    return list
      .filter((l) => l?.url && String(l.status || '').startsWith('2'))
      .filter((l) => (l.url || '').replace(/\/$/, '') !== u)
      .slice(0, 100);
  }, [link?.url, allLinks]);

  const runBrowserSimilarity = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setRows([]);
    setLoadProgress({ overall: 0, currentFile: '' });
    try {
      const progressCallback = createProgressAggregator((u) =>
        setLoadProgress({ overall: u.overall, currentFile: u.currentFile || '' })
      );
      const extractor = await loadPipeline('feature-extraction', DEFAULT_EMBEDDING_MODEL, {
        progressCallback,
      });
      const baseText = combinePageText(link, 4000);
      if (baseText.length < 8) {
        setErr(sp.errNotEnoughText);
        setBusy(false);
        return;
      }
      const baseOut = await extractor(baseText, { pooling: 'mean', normalize: true });
      const baseVec = vecFromOutput(baseOut);
      if (!baseVec) {
        setErr(sp.errNoEmbedding);
        setBusy(false);
        return;
      }

      const scored = [];
      const seen = new Set([(link?.url || '').replace(/\/$/, '')]);

      for (const c of candidates) {
        const t = combinePageText(c, 4000);
        if (t.length < 8) continue;
        const o = await extractor(t, { pooling: 'mean', normalize: true });
        const v = vecFromOutput(o);
        if (!v) continue;
        scored.push({ url: c.url, title: c.title || c.url, score: cosineSim(baseVec, v) });
      }

      if (sqlDb) {
        const extra = queryCrawlResults(sqlDb, 120);
        for (const row of extra) {
          const url = (row.url || '').replace(/\/$/, '');
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const t = combinePageText(row, 4000);
          if (t.length < 8) continue;
          const o = await extractor(t, { pooling: 'mean', normalize: true });
          const v = vecFromOutput(o);
          if (!v) continue;
          scored.push({ url: row.url, title: row.title || row.url, score: cosineSim(baseVec, v), source: 'sql' });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      setRows(scored.slice(0, 12));
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
      setLoadProgress((p) => ({ ...p, overall: 100 }));
    }
  }, [link, candidates, sqlDb, sp]);

  if (!link?.url) return null;

  return (
    <div className="border border-cyan-500/25 rounded-xl p-4 bg-cyan-950/15">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold text-cyan-400/90 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          {sp.sectionTitle}
        </h3>
        <button
          type="button"
          disabled={busy || candidates.length === 0}
          onClick={runBrowserSimilarity}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-900/50 text-cyan-200 border border-cyan-700/40 hover:bg-cyan-800/50 disabled:opacity-40 disabled:pointer-events-none"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {sp.loadingModel}
            </span>
          ) : (
            sp.findSimilar
          )}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mb-2 font-mono">{DEFAULT_EMBEDDING_MODEL}</p>
      {busy && (
        <div className="mb-3 space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{strings.components.browserMl.progressLabel}</span>
            <span>{loadProgress.overall}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, loadProgress.overall)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 truncate">
            {format(sp.downloadProgress, {
              pct: loadProgress.overall,
              file: loadProgress.currentFile || '…',
            })}
          </p>
        </div>
      )}
      {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.url}
              className="flex items-start justify-between gap-2 text-xs bg-brand-900 border border-default rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline font-mono break-all inline-flex items-center gap-1"
                >
                  {r.title}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
                {r.source === 'sql' && (
                  <span className="ml-2 text-[10px] text-slate-500 uppercase">{sp.sqlBadge}</span>
                )}
              </div>
              <span className="text-cyan-400 font-mono flex-shrink-0">{r.score.toFixed(3)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
