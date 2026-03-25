import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Gauge, ChevronDown, ChevronRight } from 'lucide-react';
import { useReport } from '../../../context/useReport';
import { useBrowserAssistant } from '../../../context/useBrowserAssistant.js';
import { formatLhMetric, parseKeywords, normaliseKw, severityBg } from '../../../utils/linkUtils';
import { palette, scoreBandColor } from '../../../utils/chartPalette';
import { registerChartJsBase, getGridColor, barOptionsHorizontal } from '../../../utils/chartJsDefaults';
import { LhAuditExpandable } from '../../lighthouse';
import OGPreview from '../OGPreview';
import { strings, format } from '../../../lib/strings';

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
  const p = strings.components.linkTabs.pageAnalysis;
  if (!nlp || typeof nlp !== 'object') return null;
  const count = nlp.entity_count;
  const labels = Array.isArray(nlp.top_entity_labels) ? nlp.top_entity_labels : [];
  if (count == null && labels.length === 0) return null;
  return (
    <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
      <div className="text-muted-foreground mb-1">{p.namedEntities}</div>
      {count != null && (
        <div className="text-foreground mb-2">{format(p.totalEntities, { count: Number(count).toLocaleString() })}</div>
      )}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((pair, i) => {
            const label = Array.isArray(pair) ? pair[0] : pair;
            const n = Array.isArray(pair) && pair.length > 1 ? pair[1] : null;
            return (
              <span
                key={`${String(label)}-${i}`}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-200/70 border border-violet-400/35 text-violet-950 dark:bg-violet-950/50 dark:border-violet-500/20 dark:text-violet-200"
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
  const p = strings.components.linkTabs.pageAnalysis;
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
        <p className="text-[10px] text-muted-foreground mb-1 italic">{p.previewFailed}</p>
      ) : null}
      <a href={href} target="_blank" rel="noreferrer" className="text-xs font-mono text-link/90 hover:underline break-all">
        {href}
      </a>
    </li>
  );
}

function ResourceSection({ title, urls, defaultOpen = false, variant = 'links', pageUrl = '' }) {
  const p = strings.components.linkTabs.pageAnalysis;
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
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-brand-800/80"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span>{title}</span>
        <span className="text-xs text-muted-foreground ml-auto font-mono">{list.length}</span>
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
                  <li key={`${u}-${i}`} className="text-xs font-mono text-link/90 break-all">
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
              className="mt-2 text-xs text-muted-foreground hover:text-bright"
            >
              {showAll ? p.showLess : format(p.showAll, { count: list.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PageAnalysisTab({ link }) {
  const p = strings.components.linkTabs.pageAnalysis;
  const sp = strings.components.similarPages;
  const sj = strings.common;
  const lhLabels = strings.lighthouse.categoryLabels;
  const { data } = useReport();
  const { openAssistant } = useBrowserAssistant();
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
      labels: [...p.resourceChartLabels],
      values: [internalN, externalN, imagesN, scriptsN, sheetsN],
    };
  }, [
    p.resourceChartLabels,
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
    const labels = keys.map((k) => lhLabels[k] || k);
    const values = keys.map((k) => {
      const v = lh.category_scores[k];
      return v != null ? Number(v) : 0;
    });
    const colors = values.map((v) => scoreBandColor(v));
    return { labels, values, colors };
  }, [lh, lhLabels]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-bright mb-1">{p.reportTitle}</h2>
        {link.title && <p className="text-sm text-muted-foreground mb-1">{link.title}</p>}
        {reportAt && (
          <p className="text-xs text-muted-foreground font-mono">{reportAt}</p>
        )}
      </div>

      {/* Summary */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{p.summary}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: p.totalWords, value: link.word_count != null ? link.word_count.toLocaleString() : sj.emDash },
            { label: p.internalLinks, value: pa.internal_link_count ?? link.internal_link_count ?? sj.emDash },
            { label: p.externalLinks, value: pa.external_link_count ?? link.external_link_count ?? sj.emDash },
            { label: p.images, value: link.images_total ?? sj.emDash },
            { label: p.scripts, value: link.script_count ?? sj.emDash },
            { label: p.stylesheets, value: link.link_stylesheet_count ?? sj.emDash },
            { label: p.preloadPreconnect, value: `${pa.preload_count ?? 0} / ${pa.preconnect_count ?? 0}` },
            { label: p.sslCertExpires, value: sslExp ? sslExp.slice(0, 10) : sj.emDash },
          ].map(({ label, value }) => (
            <div key={label} className="bg-brand-900 border border-default rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-sm font-semibold text-foreground">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-brand-900 border border-default rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-2">{p.pageResourcesCaption}</div>
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
              <div className="text-xs text-muted-foreground mb-2">{p.lhCategoryCaption}</div>
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
                      x: { grid: { color: getGridColor() } },
                      y: {
                        grid: { color: getGridColor() },
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: sj.score, color: '#64748b' },
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
        link.keyphrases?.phrases?.length > 0 ||
        pa?.signals?.language ||
        (nlpSignals && (nlpSignals.entity_count != null || (nlpSignals.top_entity_labels && nlpSignals.top_entity_labels.length > 0)))) && (
        <div className="border border-violet-400/30 dark:border-violet-500/20 rounded-xl p-4 bg-violet-100/45 dark:bg-violet-950/20 space-y-3">
          <h3 className="text-xs font-bold text-violet-800 dark:text-violet-400 uppercase tracking-wider">{p.intelligenceMl}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-foreground">
            {link.duplicate_group_id && (
              <div className="bg-brand-900 border border-default rounded-lg p-3">
                <div className="text-muted-foreground mb-1">{p.duplicateCluster}</div>
                <div className="font-mono text-violet-800 dark:text-violet-300">{link.duplicate_group_id}</div>
              </div>
            )}
            {link.detected_language && (
              <div className="bg-brand-900 border border-default rounded-lg p-3">
                <div className="text-muted-foreground mb-1">{p.detectedLanguage}</div>
                <div className="font-mono text-foreground">{link.detected_language}</div>
              </div>
            )}
            <NerBlock nlp={nlpSignals} />
            {link.keyphrases?.phrases?.length > 0 && (
              <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
                <div className="text-muted-foreground mb-2">{p.keyphrasesKeybert}</div>
                <ul className="flex flex-wrap gap-2">
                  {link.keyphrases.phrases.map((pair, i) => (
                    <li
                      key={`${pair[0]}-${i}`}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-800 border border-default text-emerald-800 dark:text-emerald-300/90"
                    >
                      {pair[0]}
                      {typeof pair[1] === 'number' && (
                        <span className="text-muted-foreground ml-1">({pair[1].toFixed(2)})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {link.ml_anomaly && (
              <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
                <div className="text-muted-foreground mb-1">{p.anomalyIsolation}</div>
                <div className="text-amber-800 dark:text-amber-400/90">
                  {p.anomalyScorePrefix} {link.ml_anomaly.anomaly_score} — {(link.ml_anomaly.reasons || []).join(', ')}
                </div>
              </div>
            )}
          </div>
          {similarRows.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">{p.similarInternalCaption}</div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {similarRows.map((row) => (
                  <li key={row.url} className="flex flex-wrap items-baseline gap-2 gap-y-0">
                    {row.score != null && !Number.isNaN(row.score) && (
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400/90 shrink-0 w-14">{row.score.toFixed(4)}</span>
                    )}
                    <a href={row.url} target="_blank" rel="noreferrer" className="text-link hover:underline font-mono text-xs break-all min-w-0">
                      {row.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="border border-cyan-500/30 dark:border-cyan-500/25 rounded-xl p-4 bg-cyan-100/50 dark:bg-cyan-950/15">
        <h3 className="text-xs font-bold text-cyan-800 dark:text-cyan-400/90 uppercase tracking-wider mb-2 flex items-center gap-2">
          {sp.sectionTitle}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">{p.similarAssistantHint}</p>
        <button
          type="button"
          onClick={() => openAssistant(link)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-200/90 text-cyan-950 border border-cyan-600/45 hover:bg-cyan-300/90 dark:bg-cyan-900/50 dark:text-cyan-200 dark:border-cyan-700/40 dark:hover:bg-cyan-800/50"
        >
          {p.openSimilarAssistant}
        </button>
      </div>

      {/* Social previews */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{p.socialPreviews}</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-2">{p.facebookOg}</div>
            <OGPreview
              url={link.url}
              ogTitle={link.og_title}
              ogDesc={link.og_description}
              ogImage={link.og_image}
            />
          </div>
          <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-2">
            <div className="text-xs text-muted-foreground mb-2">{p.twitterX}</div>
            <div className="text-sm text-foreground font-medium">{link.twitter_title || link.title || sj.emDash}</div>
            <div className="text-xs text-muted-foreground line-clamp-3">{link.og_description || link.meta_description || sj.emDash}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{link.url}</div>
          </div>
        </div>
      </div>

      {/* Lighthouse */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5" /> {p.webVitalsLighthouse}
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
                    <div className="text-xs text-muted-foreground capitalize mb-1">{lhLabels[cat] || cat.replace('-', ' ')}</div>
                    <div className="text-xl font-bold" style={{ color }}>{score != null ? score : sj.emDash}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-brand-900 border border-default rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
              {[['LCP', 'lcp_ms'], ['FCP', 'fcp_ms'], ['TBT', 'tbt_ms'], ['CLS', 'cls']].map(([label, key]) => {
                const mm = lh.median_metrics || {};
                return (
                  <div key={key}>
                    <span className="text-muted-foreground">{label} </span>
                    <span className="text-foreground font-mono">{formatLhMetric(key, mm[key])}</span>
                  </div>
                );
              })}
            </div>
            {(lh.top_failures || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{p.lhRecommendations}</div>
                {(lh.top_failures || []).map((f, i) => (
                  <div key={i} className="bg-brand-800 border border-default rounded-lg px-3 py-2 text-xs text-foreground">
                    <span className="text-muted-foreground font-mono mr-2">{f.id}</span>
                    {f.helpText || f.title || f.id}
                  </div>
                ))}
              </div>
            )}

            {failingLighthouseAudits.length > 0 && (
              <div className="mt-6 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {format(p.failingAuditsCaption, { count: failingLighthouseAudits.length })}
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
          <p className="text-sm text-muted-foreground bg-brand-900 border border-default rounded-xl p-4">
            {p.noLhData}
          </p>
        )}
      </div>

      {/* Keywords */}
      {keywords.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{p.keywordAnalysis}</h3>
          <div className="border border-default rounded-xl overflow-hidden bg-brand-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-2">{p.thKeyword}</th>
                  <th className="px-4 py-2 w-24">{p.thCount}</th>
                  <th className="px-4 py-2 w-24">{p.thScore}</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw, i) => {
                  const { word, count, score } = normaliseKw(kw);
                  return (
                    <tr key={i} className="border-b border-muted/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-foreground">{word}</td>
                      <td className="px-4 py-2 text-muted-foreground">{count ?? sj.emDash}</td>
                      <td className="px-4 py-2 text-muted-foreground">{score != null ? score : sj.emDash}</td>
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
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {format(p.onPageWarnings, { count: filteredWarnings.length })}
          </h3>
          <select
            value={sevFilter}
            onChange={(e) => setSevFilter(e.target.value)}
            className="bg-brand-800 border border-brand-700 text-xs rounded-lg px-2 py-1.5 text-foreground outline-none"
          >
            <option value="All">{p.severityAll}</option>
            <option value="high">{p.severityHigh}</option>
            <option value="medium">{p.severityMedium}</option>
            <option value="low">{p.severityLow}</option>
          </select>
        </div>
        {filteredWarnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p.noMatchingWarnings}</p>
        ) : (
          <ul className="space-y-2">
            {filteredWarnings.map((w, i) => (
              <li
                key={`${w.id}-${i}`}
                className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <span className={`text-xs px-2 py-0.5 rounded mr-2 ${severityBg(w.severity)}`}>
                  {w.severity || 'info'}
                </span>
                {w.message}
                {w.detail && (
                  <div className="mt-1 text-xs text-muted-foreground font-mono break-all">{w.detail}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resources */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{p.resources}</h3>
        <div className="space-y-2">
          {p.resourceSections.map(({ key, label }) => (
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
