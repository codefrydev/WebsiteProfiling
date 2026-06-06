import { useMemo, useState, createElement, type ComponentType } from 'react';
import Link from 'next/link';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, type TooltipItem } from 'chart.js';
import { BookOpen, BarChart2, Check, FileText, Layers, Share2, Tag, X } from 'lucide-react';
import type { LinkDetail } from '@/types/report';
import { useReport } from '../../../context/useReport';
import { Card } from '../../../components';
import { RatioBar, RankedBarChart } from '../../../components/charts';
import { wcLabel, readingLabel, parseKeywords, normaliseKw } from '../../../utils/linkUtils';
import { PALETTE_CATEGORICAL } from '../../../utils/chartPalette';
import HeadingPills from '../HeadingPills';
import { strings, format } from '../../../lib/strings';
import { getGridColor, getChartTitleColor } from '../../../utils/chartJsDefaults';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function barOptsH(suffixLabel?: string) {
  const sj = strings.common;
  return {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${ctx.raw?.toLocaleString() ?? ctx.raw}${suffixLabel ? ` ${suffixLabel}` : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: sj.count, color: getChartTitleColor() } },
      y: { grid: { color: getGridColor() } },
    },
  };
}

function formatPctDelta(page: number, ref: number | null): string | null {
  if (ref == null || ref === 0 || page <= 0) return null;
  const pct = ((page - ref) / ref) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function barOptsCompare() {
  const lc = strings.components.linkTabs.content;
  const ch = strings.charts;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => ` ${format(lc.tooltipWords, { n: ctx.raw?.toLocaleString() ?? ctx.raw })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: ch.words, color: getChartTitleColor() } },
    },
  };
}

function qualityBadgeClass(label: string): string {
  const s = label.toLowerCase();
  if (s.includes('missing') || s.includes('no h1')) {
    return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
  }
  if (s.includes('short') || s.includes('long') || s.includes('multiple')) {
    return 'bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30';
  }
  return 'bg-green-500/15 text-green-800 dark:text-green-400 border-green-500/30';
}

function titleQualityIndex(len: number | string | undefined): number {
  const n = Number(len) || 0;
  if (n === 0) return 0;
  if (n < 30) return 1;
  if (n <= 60) return 2;
  return 3;
}

function metaQualityIndex(len: number | string | undefined): number {
  const n = Number(len) || 0;
  if (n === 0) return 0;
  if (n < 70) return 1;
  if (n <= 160) return 2;
  return 3;
}

function h1QualityIndex(count: number | string | undefined): number {
  const c = Number(count);
  if (c === 0 || Number.isNaN(c)) return 0;
  if (c === 1) return 1;
  return 2;
}

interface SectionHeaderProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}

function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-3 border-b border-muted pb-3 mb-1">
      <div className="p-2 bg-brand-800 border border-default rounded-lg shrink-0">
        {createElement(icon, { className: 'h-4 w-4 text-link' })}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-bright">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function QualityStatusRow({ label, detail, statusLabel }: { label: string; detail: string; statusLabel: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-bold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${qualityBadgeClass(statusLabel)}`}>
        {statusLabel}
      </span>
    </div>
  );
}

function SocialCheckItem({ label, present }: { label: string; present: boolean }) {
  const lc = strings.components.linkTabs.content;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-muted/50 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${present ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {present ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
        {present ? lc.socialPresent : lc.socialMissing}
      </span>
    </div>
  );
}

export interface ContentTabProps {
  link: LinkDetail;
}

export default function ContentTab({ link }: ContentTabProps) {
  const lc = strings.components.linkTabs.content;
  const vca = strings.views.contentAnalytics;
  const sj = strings.common;
  const lo = strings.components.linkTabs.overview;
  const { data } = useReport();
  const [kwHover, setKwHover] = useState<number | null>(null);

  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const keywords = useMemo(() => parseKeywords(link.top_keywords), [link.top_keywords]);
  const ratioPct = Math.min(100, Math.max(0, Number(link.content_html_ratio) || 0));

  const ca = data?.content_analytics ?? {};
  const wcStats = ca.word_count_stats ?? {};
  const meanW = wcStats.mean != null ? Math.round(wcStats.mean) : null;
  const medianW = wcStats.median != null ? Math.round(wcStats.median) : null;

  const titleLen = (link.title || '').length;
  const metaLen = link.meta_description_len != null ? Number(link.meta_description_len) : (link.meta_description || '').length;
  const h1c = link.h1_count != null ? Number(link.h1_count) : null;

  const titleQualLabels = vca.titleQualLabels;
  const metaQualLabels = vca.metaQualLabels;
  const h1QualLabels = vca.h1Labels;

  const titleStatus = titleQualLabels[titleQualityIndex(titleLen)] ?? sj.emDash;
  const metaStatus = metaQualLabels[metaQualityIndex(metaLen)] ?? sj.emDash;
  const h1Status = h1c != null && !Number.isNaN(h1c) ? h1QualLabels[h1QualityIndex(h1c)] : null;

  const kwSorted = useMemo(() => {
    const rows = keywords.map((kw) => normaliseKw(kw)).filter((k) => k.word);
    rows.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    return rows.slice(0, 20);
  }, [keywords]);

  const hasOg = !!(link.og_title && String(link.og_title).trim());
  const hasTw = !!(link.twitter_card && String(link.twitter_card).trim());
  const hasOgImg = !!(link.og_image && String(link.og_image).trim());

  const compareBarData = useMemo(() => {
    const labels = [lc.labelThisPage];
    const values = [wc];
    const colors = ['#4C72B0'];
    if (meanW != null) {
      labels.push(lc.labelSiteMean);
      values.push(meanW);
      colors.push('#55A868');
    }
    if (medianW != null) {
      labels.push(lc.labelSiteMedian);
      values.push(medianW);
      colors.push('#DD8452');
    }
    return { labels, values, colors };
  }, [wc, meanW, medianW, lc.labelThisPage, lc.labelSiteMean, lc.labelSiteMedian]);

  const meanDelta = formatPctDelta(wc, meanW);
  const medianDelta = formatPctDelta(wc, medianW);
  const compareAria = compareBarData.labels
    .map((label, i) => `${label}: ${compareBarData.values[i]?.toLocaleString() ?? 0} words`)
    .join('; ');
  const kwAria = kwSorted.length
    ? kwSorted.map((k) => `${k.word}: ${Number(k.count) || 0}`).join('; ')
    : '';

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground -mt-2">
        {lc.intro}{' '}
        <Link href="/content-analytics" className="text-link-soft hover:underline font-medium">
          {lc.viewSiteDistributions}
        </Link>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> {lc.kpiWords}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${wcInfo.color}`}>{wc.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{wcInfo.label}</div>
          {meanDelta != null && (
            <div className="text-[10px] text-muted-foreground mt-1">{format(lc.vsSiteMeanDelta, { pct: meanDelta })}</div>
          )}
          {medianDelta != null && (
            <div className="text-[10px] text-muted-foreground">{format(lc.vsSiteMedianDelta, { pct: medianDelta })}</div>
          )}
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {lc.kpiReading}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${rlInfo.color}`}>
            {rl > 0 ? format(lo.readingGrade, { n: rl }) : sj.emDash}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{rl > 0 ? rlInfo.label : lc.notEnoughText}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">{lc.textHtml}</div>
          <div className="text-2xl font-bold text-bright tabular-nums">{ratioPct.toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.bodyTextShare}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> {lc.kpiDepth}
          </div>
          <div className="text-2xl font-bold text-bright tabular-nums">{link.depth != null ? link.depth : sj.emDash}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.crawlDepth}</div>
        </Card>
        <Card shadow className={`!p-4 ${wc < 300 && wc > 0 ? 'ring-1 ring-amber-500/30' : ''}`}>
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">{lc.thinQ}</div>
          <div className={`text-2xl font-bold tabular-nums ${wc < 300 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
            {wc <= 0 ? sj.emDash : wc < 300 ? sj.yes : sj.no}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.under300Words}</div>
        </Card>
      </div>

      <div className="space-y-4">
        <SectionHeader icon={BarChart2} title={lc.vsSiteTitle} description={lc.vsSiteDesc} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.wordCountComparison}</h3>
            <p className="text-xs text-muted-foreground mb-2">{lc.vsSiteAggregates}</p>
            <div className="h-56">
              {compareBarData.values.length > 0 ? (
                <RankedBarChart
                  ariaSummary={`Word count comparison. ${compareAria}`}
                  heightClass="h-56"
                  data={{
                    labels: compareBarData.labels,
                    datasets: [{ data: compareBarData.values, backgroundColor: compareBarData.colors }],
                  }}
                  options={barOptsCompare()}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.textVsMarkup}</h3>
            <p className="text-xs text-muted-foreground mb-4">{lc.textVsMarkupDesc}</p>
            <RatioBar
              label={lc.textVsMarkup}
              primaryLabel={lc.doughnutBodyText}
              secondaryLabel={lc.doughnutOtherMarkup}
              primaryPct={ratioPct}
            />
          </Card>
        </div>
      </div>

      {kwSorted.length > 0 && (
        <div className="space-y-4">
          <SectionHeader icon={BarChart2} title={lc.topKeywordsPage} description={lc.freqThisUrl} />
          <Card padding="tight">
            <div className="h-56">
              <RankedBarChart
                ariaSummary={`Top keywords on this page. ${kwAria}`}
                heightClass="h-56"
                data={{
                  labels: kwSorted.map((k) => k.word),
                  datasets: [{ data: kwSorted.map((k) => Number(k.count) || 0), backgroundColor: PALETTE_CATEGORICAL[0] }],
                }}
                options={barOptsH(lc.horizontalBarSuffix)}
              />
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        <SectionHeader icon={Tag} title={lc.onPageSignalsTitle} description={lc.onPageSignalsDesc} />
        <Card padding="tight" className="divide-y divide-muted/50 space-y-0">
          <div className="py-4 first:pt-0 last:pb-0">
            <QualityStatusRow
              label={lc.titleTag}
              detail={format(lc.characters, { n: titleLen })}
              statusLabel={titleStatus}
            />
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <QualityStatusRow
              label={lc.metaDesc}
              detail={format(lc.characters, { n: metaLen })}
              statusLabel={metaStatus}
            />
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            {h1Status ? (
              <QualityStatusRow
                label={lc.h1Count}
                detail={format(lc.headingCount, { n: h1c ?? 0 })}
                statusLabel={h1Status}
              />
            ) : (
              <div className="text-sm text-muted-foreground">{lc.noH1Data}</div>
            )}
          </div>
        </Card>
      </div>

      {link.content_excerpt && String(link.content_excerpt).trim() && (
        <div className="space-y-4">
          <SectionHeader icon={FileText} title={lc.contentExcerpt} description={lc.contentExcerptHint} />
          <Card padding="tight">
            <p className="text-xs text-foreground whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed">
              {String(link.content_excerpt).trim()}
            </p>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        <SectionHeader icon={Share2} title={lc.socialMetaTitle} description={lc.socialMetaDesc} />
        <Card padding="tight">
          <SocialCheckItem label={vca.openGraph} present={hasOg} />
          <SocialCheckItem label={vca.twitterCard} present={hasTw} />
          <SocialCheckItem label={vca.ogImage} present={hasOgImg} />
        </Card>
      </div>

      {link.heading_sequence && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-3">{lc.headingStructure}</div>
          <HeadingPills sequence={link.heading_sequence} />
        </div>
      )}

      {keywords.length > 0 && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-3">{lc.keywordsQuick}</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => {
              const { word, count } = normaliseKw(kw);
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setKwHover(i)}
                    onMouseLeave={() => setKwHover(null)}
                    className="text-xs bg-blue-500/10 text-link-soft border border-blue-500/20 px-2.5 py-1 rounded-full font-mono hover:bg-blue-500/20 transition-colors"
                  >
                    {word}
                  </button>
                  {kwHover === i && count != null && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-brand-800 border border-default text-xs text-foreground px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                      {format(lc.occurrences, { n: count })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
