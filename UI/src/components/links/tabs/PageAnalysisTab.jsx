import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Gauge, ChevronDown, ChevronRight } from 'lucide-react';
import { useReport } from '../../../context/useReport';
import { formatLhMetric, parseKeywords, normaliseKw, severityBg } from '../../../utils/linkUtils';
import { palette, scoreBandColor } from '../../../utils/chartPalette';
import { registerChartJsBase, GRID_COLOR, barOptionsHorizontal } from '../../../utils/chartJsDefaults';
import { LhAuditExpandable } from '../../lighthouse';
import OGPreview from '../OGPreview';
import SimilarPagesTf from '../SimilarPagesTf';

registerChartJsBase();

/** @param {unknown} raw */
function normalizeSimilarInternal(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return { url: item, score: null };
      if (item && typeof item === 'object' && typeof item.url === 'string') {
        const sc = item.score;
        return {
          url: item.url,
          score: sc != null && sc !== '' ? Number(sc) : null,
        };
      }
      return null;
    })
    .filter(Boolean);
}

/** @param {Record<string, unknown>|undefined} nlp */
function NerBlock({ nlp }) {
  if (!nlp || typeof nlp !== 'object') return null;
  const count = nlp.entity_count;
  const labels = Array.isArray(nlp.top_entity_labels) ? nlp.top_entity_labels : [];
  if (count == null && labels.length === 0) return null;
  return (
    <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
      <div className="text-slate-500 mb-1">Named entities (spaCy)</div>
      {count != null && <div className="text-slate-200 mb-2">Total entities: {Number(count).toLocaleString()}</div>}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((pair, i) => {
            const label = Array.isArray(pair) ? pair[0] : pair;
            const n = Array.isArray(pair) && pair.length > 1 ? pair[1] : null;
            return (
              <span
                key={`${String(label)}-${i}`}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-950/50 border border-violet-500/20 text-violet-200"
              >
                {String(label)}
                {n != null ? `: ${n}` : ''}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

const RESOURCE_KEYS = [
  { key: 'internal_links', label: 'Internal links' },
  { key: 'external_links', label: 'External links' },
  { key: 'stylesheet_urls', label: 'Stylesheets' },
  { key: 'script_urls', label: 'Scripts' },
  { key: 'image_urls', label: 'Images' },
];

function resolveResourceUrl(raw, pageUrl) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
  if (!pageUrl) return s;
  try {
    return new URL(s, pageUrl).href;
  } catch {
    return s;
  }
}

function ImageUrlListItem({ rawUrl, pageUrl }) {
  const [broken, setBroken] = useState(false);
  const href = resolveResourceUrl(rawUrl, pageUrl);
  if (!href) return null;
  const showImg =
    /^data:image\//i.test(href) ||
    href.startsWith('http://') ||
    href.startsWith('https://');

  return (
    <li className="border-b border-muted/40 last:border-0 pb-3 last:pb-0">
      {showImg && !broken ? (
        <div className="mb-2 rounded-lg border border-muted overflow-hidden bg-brand-950 inline-block max-w-full">
          <img
            src={href}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-36 max-w-full object-contain block"
            onError={() => setBroken(true)}
          />
        </div>
      ) : null}
      {showImg && broken ? (
        <p className="text-[10px] text-slate-500 mb-1 italic">Preview failed to load (hotlink or CORS). Open link below.</p>
      ) : null}
      <a href={href} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-400/90 hover:underline break-all">
        {href}
      </a>
    </li>
  );
}

function ResourceSection({ title, urls, defaultOpen = false, variant = 'links', pageUrl = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const list = Array.isArray(urls) ? urls : [];
  const cap = variant === 'images' ? 24 : 40;
  const shown = showAll ? list : list.slice(0, cap);

  if (list.length === 0) return null;

  const scrollClass = variant === 'images' ? 'max-h-[32rem] overflow-y-auto' : 'max-h-64 overflow-y-auto';

  return (
    <div className="border border-default rounded-xl overflow-hidden bg-brand-900">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-brand-800/80"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span>{title}</span>
        <span className="text-xs text-slate-500 ml-auto font-mono">{list.length}</span>
      </button>
      {open && (
        <div className={`px-4 pb-3 border-t border-muted ${scrollClass}`}>
          {variant === 'images' ? (
            <ul className="mt-3 space-y-4">
              {shown.map((u, i) => (
                <ImageUrlListItem key={`${u}-${i}`} rawUrl={u} pageUrl={pageUrl} />
              ))}
            </ul>
          ) : (
            <ul className="mt-2 space-y-1">
              {shown.map((u, i) => {
                const resolved = resolveResourceUrl(u, pageUrl) || u;
                return (
                  <li key={`${u}-${i}`} className="text-xs font-mono text-blue-400/90 break-all">
                    <a href={resolved} target="_blank" rel="noreferrer" className="hover:underline">
                      {resolved}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length > cap && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-xs text-slate-500 hover:text-bright"
            >
              {showAll ? 'Show less' : `Show all ${list.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PageAnalysisTab({ link }) {
  const { data } = useReport();
  const pa = link.page_analysis && typeof link.page_analysis === 'object' ? link.page_analysis : {};
  const lh = link.lighthouse || null;
  const nlpSignals = link.nlp_entities || pa?.signals?.nlp_entities;
  const similarRows = useMemo(() => normalizeSimilarInternal(link.similar_internal), [link.similar_internal]);

  const [sevFilter, setSevFilter] = useState('All');
  const filteredWarnings = useMemo(() => {
    const warnings = Array.isArray(pa.warnings) ? pa.warnings : [];
    if (sevFilter === 'All') return warnings;
    return warnings.filter((w) => (w.severity || '').toLowerCase() === sevFilter.toLowerCase());
  }, [pa.warnings, sevFilter]);

  const keywords = useMemo(() => parseKeywords(link.top_keywords), [link.top_keywords]);

  const failingLighthouseAudits = useMemo(() => {
    const audits = lh?.audits;
    if (!Array.isArray(audits)) return [];
    return audits.filter((a) => a?.score != null && a.score < 1);
  }, [lh?.audits]);

  const reportAt = data?.report_generated_at || data?.crawl_run_created_at || null;
  const sslExp = data?.site_ssl_expires_at || null;

  const resourceChart = useMemo(() => {
    const internalN = Number(pa.internal_link_count ?? link.internal_link_count) || 0;
    const externalN = Number(pa.external_link_count ?? link.external_link_count) || 0;
    const imagesN = Number(link.images_total) || 0;
    const scriptsN = Number(link.script_count) || 0;
    const sheetsN = Number(link.link_stylesheet_count) || 0;
    return {
      labels: ['Internal links', 'External links', 'Images', 'Scripts', 'Stylesheets'],
      values: [internalN, externalN, imagesN, scriptsN, sheetsN],
    };
  }, [
    pa.internal_link_count,
    pa.external_link_count,
    link.internal_link_count,
    link.external_link_count,
    link.images_total,
    link.script_count,
    link.link_stylesheet_count,
  ]);

  const resourceBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: { callbacks: { label: (ctx) => ` ${Number(ctx.raw).toLocaleString()}` } },
      },
    };
  }, []);

  const lhCategoryChart = useMemo(() => {
    if (!lh?.category_scores) return null;
    const keys = ['performance', 'accessibility', 'best-practices', 'seo'];
    const labels = keys.map((k) => k.replace('-', ' '));
    const values = keys.map((k) => {
      const v = lh.category_scores[k];
      return v != null ? Number(v) : 0;
    });
    const colors = values.map((v) => scoreBandColor(v));
    return { labels, values, colors };
  }, [lh]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-bright mb-1">Page analysis report</h2>
        {link.title && <p className="text-sm text-slate-400 mb-1">{link.title}</p>}
        {reportAt && (
          <p className="text-xs text-slate-500 font-mono">{reportAt}</p>
        )}
      </div>

      {/* Summary */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total words', value: link.word_count != null ? link.word_count.toLocaleString() : '—' },
            { label: 'Internal links', value: pa.internal_link_count ?? link.internal_link_count ?? '—' },
            { label: 'External links', value: pa.external_link_count ?? link.external_link_count ?? '—' },
            { label: 'Images', value: link.images_total ?? '—' },
            { label: 'Scripts', value: link.script_count ?? '—' },
            { label: 'Stylesheets', value: link.link_stylesheet_count ?? '—' },
            { label: 'Preload / preconnect', value: `${pa.preload_count ?? 0} / ${pa.preconnect_count ?? 0}` },
            { label: 'SSL cert expires (site)', value: sslExp ? sslExp.slice(0, 10) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-brand-900 border border-default rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-1">{label}</div>
              <div className="text-sm font-semibold text-slate-200">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-brand-900 border border-default rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-2">Page resources (same as summary counts)</div>
            <div className="h-48">
              <Bar
                data={{
                  labels: resourceChart.labels,
                  datasets: [{ data: resourceChart.values, backgroundColor: palette(resourceChart.labels.length) }],
                }}
                options={resourceBarOpts}
              />
            </div>
          </div>
          {lhCategoryChart && (
            <div className="bg-brand-900 border border-default rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-2">Lighthouse category scores (0–100)</div>
              <div className="h-48">
                <Bar
                  data={{
                    labels: lhCategoryChart.labels,
                    datasets: [{ data: lhCategoryChart.values, backgroundColor: lhCategoryChart.colors }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { color: GRID_COLOR } },
                      y: {
                        grid: { color: GRID_COLOR },
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Score', color: '#64748b' },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {(link.duplicate_group_id ||
        similarRows.length > 0 ||
        link.ml_anomaly ||
        link.detected_language ||
        pa?.signals?.language ||
        (nlpSignals && (nlpSignals.entity_count != null || (nlpSignals.top_entity_labels && nlpSignals.top_entity_labels.length > 0)))) && (
        <div className="border border-violet-500/20 rounded-xl p-4 bg-violet-950/20 space-y-3">
          <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider">Intelligence (Python ML)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
            {link.duplicate_group_id && (
              <div className="bg-brand-900 border border-default rounded-lg p-3">
                <div className="text-slate-500 mb-1">Duplicate cluster</div>
                <div className="font-mono text-violet-300">{link.duplicate_group_id}</div>
              </div>
            )}
            {link.detected_language && (
              <div className="bg-brand-900 border border-default rounded-lg p-3">
                <div className="text-slate-500 mb-1">Detected language</div>
                <div className="font-mono text-slate-200">{link.detected_language}</div>
              </div>
            )}
            <NerBlock nlp={nlpSignals} />
            {link.ml_anomaly && (
              <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
                <div className="text-slate-500 mb-1">Anomaly (IsolationForest)</div>
                <div className="text-amber-400/90">
                  score {link.ml_anomaly.anomaly_score} — {(link.ml_anomaly.reasons || []).join(', ')}
                </div>
              </div>
            )}
          </div>
          {similarRows.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-2">Precomputed similar internal URLs (cosine vs site pages)</div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {similarRows.map((row) => (
                  <li key={row.url} className="flex flex-wrap items-baseline gap-2 gap-y-0">
                    {row.score != null && !Number.isNaN(row.score) && (
                      <span className="text-[10px] font-mono text-emerald-400/90 shrink-0 w-14">{row.score.toFixed(4)}</span>
                    )}
                    <a href={row.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-mono text-xs break-all min-w-0">
                      {row.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <SimilarPagesTf link={link} allLinks={data?.links || []} />

      {/* Social previews */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Social previews</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-2">Facebook / Open Graph</div>
            <OGPreview
              url={link.url}
              ogTitle={link.og_title}
              ogDesc={link.og_description}
              ogImage={link.og_image}
            />
          </div>
          <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-500 mb-2">Twitter / X</div>
            <div className="text-sm text-slate-200 font-medium">{link.twitter_title || link.title || '—'}</div>
            <div className="text-xs text-slate-400 line-clamp-3">{link.og_description || link.meta_description || '—'}</div>
            <div className="text-xs text-slate-500 font-mono truncate">{link.url}</div>
          </div>
        </div>
      </div>

      {/* Lighthouse */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5" /> Web vitals / Lighthouse
        </h3>
        {lh ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {['performance', 'accessibility', 'best-practices', 'seo'].map((cat) => {
                const cs = lh.category_scores || {};
                const score = cs[cat] != null ? Number(cs[cat]) : null;
                const color = score != null ? scoreBandColor(score) : 'rgb(71,85,105)';
                return (
                  <div key={cat} className="bg-brand-900 rounded-xl p-3 border border-default text-center">
                    <div className="text-xs text-slate-500 capitalize mb-1">{cat.replace('-', ' ')}</div>
                    <div className="text-xl font-bold" style={{ color }}>{score != null ? score : '—'}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-brand-900 border border-default rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
              {[['LCP', 'lcp_ms'], ['FCP', 'fcp_ms'], ['TBT', 'tbt_ms'], ['CLS', 'cls']].map(([label, key]) => {
                const mm = lh.median_metrics || {};
                return (
                  <div key={key}>
                    <span className="text-slate-500">{label} </span>
                    <span className="text-slate-200 font-mono">{formatLhMetric(key, mm[key])}</span>
                  </div>
                );
              })}
            </div>
            {(lh.top_failures || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Recommendations (Lighthouse)</div>
                {(lh.top_failures || []).map((f, i) => (
                  <div key={i} className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-xs text-slate-300">
                    <span className="text-slate-500 font-mono mr-2">{f.id}</span>
                    {f.helpText || f.title || f.id}
                  </div>
                ))}
              </div>
            )}

            {failingLighthouseAudits.length > 0 && (
              <div className="mt-6 space-y-2">
                <div className="text-xs text-slate-500">
                  Failing audits — expand for tables, thumbnails, and DOM nodes ({failingLighthouseAudits.length})
                </div>
                <ul className="space-y-2">
                  {failingLighthouseAudits.map((a) => (
                    <LhAuditExpandable key={a.id} audit={a} />
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 bg-brand-900 border border-default rounded-xl p-4">
            No Lighthouse data for this URL. Run a crawl with per-page Lighthouse enabled to see Core Web Vitals and performance recommendations here.
          </p>
        )}
      </div>

      {/* Keywords */}
      {keywords.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Keyword analysis</h3>
          <div className="border border-default rounded-xl overflow-hidden bg-brand-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-2">Keyword</th>
                  <th className="px-4 py-2 w-24">Count</th>
                  <th className="px-4 py-2 w-24">Score</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw, i) => {
                  const { word, count, score } = normaliseKw(kw);
                  return (
                    <tr key={i} className="border-b border-muted/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-slate-200">{word}</td>
                      <td className="px-4 py-2 text-slate-400">{count ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-400">{score != null ? score : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            On-page warnings ({filteredWarnings.length})
          </h3>
          <select
            value={sevFilter}
            onChange={(e) => setSevFilter(e.target.value)}
            className="bg-brand-800 border border-slate-700 text-xs rounded-lg px-2 py-1.5 text-slate-200 outline-none"
          >
            <option value="All">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        {filteredWarnings.length === 0 ? (
          <p className="text-sm text-slate-500">No matching warnings for this page.</p>
        ) : (
          <ul className="space-y-2">
            {filteredWarnings.map((w, i) => (
              <li
                key={`${w.id}-${i}`}
                className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-slate-300"
              >
                <span className={`text-xs px-2 py-0.5 rounded mr-2 ${severityBg(w.severity)}`}>
                  {w.severity || 'info'}
                </span>
                {w.message}
                {w.detail && (
                  <div className="mt-1 text-xs text-slate-500 font-mono break-all">{w.detail}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resources */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Resources</h3>
        <div className="space-y-2">
          {RESOURCE_KEYS.map(({ key, label }) => (
            <ResourceSection
              key={key}
              title={label}
              urls={pa[key]}
              pageUrl={link.url}
              variant={key === 'image_urls' ? 'images' : 'links'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
