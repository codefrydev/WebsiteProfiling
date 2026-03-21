import { useMemo, useState, useCallback } from 'react';
import { Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { useReport } from '../../context/useReport';
import { queryCrawlResults } from '../../lib/loadReportDb';

function combineText(linkLike) {
  const t = [linkLike.title, linkLike.h1, linkLike.meta_description].filter(Boolean).join(' ').trim();
  return t.slice(0, 2000);
}

function vecFromOutput(out) {
  if (!out) return null;
  if (out.data) return Array.from(out.data);
  if (out instanceof Float32Array) return Array.from(out);
  if (Array.isArray(out)) return out;
  return null;
}

function cosineSim(a, b) {
  if (!a?.length || !b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/**
 * Optional Transformers.js similarity vs other crawled URLs (and optional SQL crawl rows).
 */
export default function SimilarPagesTf({ link, allLinks = [] }) {
  const { sqlDb } = useReport();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [rows, setRows] = useState([]);

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
    try {
      const { pipeline } = await import('@xenova/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
      });
      const baseText = combineText(link);
      if (baseText.length < 8) {
        setErr('Not enough text on this page to embed (add title/H1/description).');
        setBusy(false);
        return;
      }
      const baseOut = await extractor(baseText, { pooling: 'mean', normalize: true });
      const baseVec = vecFromOutput(baseOut);
      if (!baseVec) {
        setErr('Could not compute embedding for this page.');
        setBusy(false);
        return;
      }

      const scored = [];
      const seen = new Set([(link?.url || '').replace(/\/$/, '')]);

      for (const c of candidates) {
        const t = combineText(c);
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
          const t = [row.title, row.h1, row.meta_description].filter(Boolean).join(' ').trim().slice(0, 2000);
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
    }
  }, [link, candidates, sqlDb]);

  if (!link?.url) return null;

  return (
    <div className="border border-cyan-500/25 rounded-xl p-4 bg-cyan-950/15">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-cyan-400/90 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Browser similarity (Transformers.js)
        </h3>
        <button
          type="button"
          disabled={busy || candidates.length === 0}
          onClick={runBrowserSimilarity}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-900/50 text-cyan-200 border border-cyan-700/40 hover:bg-cyan-800/50 disabled:opacity-40 disabled:pointer-events-none"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading model…
            </span>
          ) : (
            'Find similar pages'
          )}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Runs <code className="text-slate-400">Xenova/all-MiniLM-L6-v2</code> in your browser.{' '}
        <span className="text-slate-400">
          First use usually downloads on the order of <strong className="text-slate-300">~25–90 MB</strong> of model
          weights (then cached locally).
        </span>{' '}
        Compares this page to up to {candidates.length} URLs from the report payload
        {sqlDb ? ' plus rows from crawl_results in report.db' : ''}. For full-site clustering, use Python{' '}
        <code className="text-slate-400">enable_semantic_similar_internal</code>.
      </p>
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
                  <span className="ml-2 text-[10px] text-slate-500 uppercase">sql</span>
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
