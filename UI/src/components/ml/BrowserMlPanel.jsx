import { useCallback, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { strings } from '../../lib/strings';
import {
  loadPipeline,
  MODEL_LABELS,
  createProgressAggregator,
  combinePageText,
} from '../../lib/transformersClient';

function MlProgressBar({ overall, label }) {
  const pct = Math.min(100, Math.max(0, Number(overall) || 0));
  return (
    <div className="space-y-1 mb-3">
      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
        <span>{strings.components.browserMl.progressLabel}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 transition-all duration-300 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <p className="text-[10px] text-slate-500 truncate font-mono">{label}</p>}
    </div>
  );
}

export default function BrowserMlPanel({ links = [], compact = false }) {
  const bm = strings.components.browserMl;
  const sectionGap = compact ? 'space-y-4' : 'space-y-6';
  const sampleLinks = useMemo(() => {
    const list = Array.isArray(links) ? links : [];
    return list
      .filter((l) => l?.url && String(l.status || '').startsWith('2'))
      .slice(0, 20);
  }, [links]);

  const [labelsInput, setLabelsInput] = useState('blog, product page, support, legal, documentation, landing page');
  const [zsBusy, setZsBusy] = useState(false);
  const [zsErr, setZsErr] = useState(null);
  const [zsRows, setZsRows] = useState([]);
  const [zsProg, setZsProg] = useState({ overall: 0, label: '' });

  const [sentBusy, setSentBusy] = useState(false);
  const [sentErr, setSentErr] = useState(null);
  const [sentRows, setSentRows] = useState([]);
  const [sentProg, setSentProg] = useState({ overall: 0, label: '' });

  const runZeroShot = useCallback(async () => {
    setZsBusy(true);
    setZsErr(null);
    setZsRows([]);
    setZsProg({ overall: 0, label: '' });
    try {
      const labels = labelsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (labels.length < 2) {
        setZsErr(bm.zeroShotNeedTwoLabels);
        setZsBusy(false);
        return;
      }
      const progressCallback = createProgressAggregator((u) =>
        setZsProg({ overall: u.overall, label: u.currentFile || '' })
      );
      const classifier = await loadPipeline('zero-shot-classification', MODEL_LABELS.zeroShot, {
        progressCallback,
      });
      const out = [];
      for (const link of sampleLinks) {
        const text = combinePageText(link, 3500);
        if (text.length < 20) continue;
        const result = await classifier(text, labels, { multi_label: false });
        const topLabel = result?.labels?.[0];
        const topScore = result?.scores?.[0];
        if (topLabel != null) {
          out.push({
            url: link.url,
            title: link.title || link.url,
            label: topLabel,
            score: typeof topScore === 'number' ? topScore : 0,
          });
        }
      }
      out.sort((a, b) => b.score - a.score);
      setZsRows(out);
    } catch (e) {
      setZsErr(e?.message || String(e));
    } finally {
      setZsBusy(false);
      setZsProg({ overall: 100, label: '' });
    }
  }, [labelsInput, sampleLinks, bm.zeroShotNeedTwoLabels]);

  const runSentiment = useCallback(async () => {
    setSentBusy(true);
    setSentErr(null);
    setSentRows([]);
    setSentProg({ overall: 0, label: '' });
    try {
      const progressCallback = createProgressAggregator((u) =>
        setSentProg({ overall: u.overall, label: u.currentFile || '' })
      );
      const clf = await loadPipeline('text-classification', MODEL_LABELS.sentiment, { progressCallback });
      const out = [];
      for (const link of sampleLinks) {
        const snippet = [link.meta_description, link.og_description, link.title].filter(Boolean).join(' ').trim();
        if (snippet.length < 12) continue;
        const raw = await clf(snippet.slice(0, 512));
        const first = Array.isArray(raw) ? raw[0] : raw;
        const label = first?.label ?? '';
        const score = typeof first?.score === 'number' ? first.score : 0;
        out.push({ url: link.url, title: link.title || link.url, label, score });
      }
      out.sort((a, b) => b.score - a.score);
      setSentRows(out);
    } catch (e) {
      setSentErr(e?.message || String(e));
    } finally {
      setSentBusy(false);
      setSentProg({ overall: 100, label: '' });
    }
  }, [sampleLinks]);

  if (sampleLinks.length === 0) {
    return (
      <div className="text-xs text-slate-500 border border-muted rounded-xl p-4 bg-brand-900/30">
        {bm.noPages}
      </div>
    );
  }

  return (
    <div className={sectionGap}>
      <div className="flex items-start gap-2">
        <Sparkles className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-bright">{bm.panelTitle}</h3>
          <p className="text-xs text-slate-500 mt-1">{bm.hintModels}</p>
        </div>
      </div>

      <div className="border border-violet-500/25 rounded-xl p-4 bg-violet-950/20">
        <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-2">{bm.zeroShotTitle}</h4>
        <p className="text-[11px] text-slate-500 mb-2 font-mono">{MODEL_LABELS.zeroShot}</p>
        <label className="block text-xs text-slate-400 mb-1">{bm.zeroShotLabels}</label>
        <textarea
          value={labelsInput}
          onChange={(e) => setLabelsInput(e.target.value)}
          rows={2}
          className="w-full text-xs bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-slate-200 mb-2"
        />
        {(zsBusy || zsProg.overall > 0) && zsBusy && (
          <MlProgressBar overall={zsProg.overall} label={zsProg.label} />
        )}
        <button
          type="button"
          disabled={zsBusy}
          onClick={runZeroShot}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-900/50 text-violet-200 border border-violet-700/40 hover:bg-violet-800/50 disabled:opacity-40"
        >
          {zsBusy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {bm.zeroShotBusy}
            </span>
          ) : (
            bm.zeroShotRun
          )}
        </button>
        {zsErr && <p className="text-xs text-red-400 mt-2">{zsErr}</p>}
        {zsRows.length > 0 && (
          <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {zsRows.map((r) => (
              <li
                key={r.url}
                className="flex justify-between gap-2 text-xs bg-brand-900 border border-default rounded px-2 py-1.5"
              >
                <span className="text-blue-400 truncate font-mono" title={r.url}>
                  {r.title}
                </span>
                <span className="text-violet-300 shrink-0">
                  {r.label} ({r.score.toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border border-amber-500/25 rounded-xl p-4 bg-amber-950/15">
        <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">{bm.sentimentTitle}</h4>
        <p className="text-xs text-slate-500 mb-2">{bm.sentimentDesc}</p>
        <p className="text-[11px] text-slate-500 mb-2 font-mono">{MODEL_LABELS.sentiment}</p>
        {(sentBusy || sentProg.overall > 0) && sentBusy && (
          <MlProgressBar overall={sentProg.overall} label={sentProg.label} />
        )}
        <button
          type="button"
          disabled={sentBusy}
          onClick={runSentiment}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-900/40 text-amber-200 border border-amber-700/40 hover:bg-amber-800/40 disabled:opacity-40"
        >
          {sentBusy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {bm.sentimentBusy}
            </span>
          ) : (
            bm.sentimentRun
          )}
        </button>
        {sentErr && <p className="text-xs text-red-400 mt-2">{sentErr}</p>}
        {sentRows.length > 0 && (
          <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {sentRows.map((r) => (
              <li
                key={r.url}
                className="flex justify-between gap-2 text-xs bg-brand-900 border border-default rounded px-2 py-1.5"
              >
                <span className="text-blue-400 truncate font-mono" title={r.url}>
                  {r.title}
                </span>
                <span className="text-amber-300 shrink-0 font-mono">
                  {r.label} {r.score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
