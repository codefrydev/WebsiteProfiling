import { useMemo } from 'react';
import { Check, ChevronRight, Gauge, X } from 'lucide-react';
import { Badge, LabelWithHint } from '../../index';
import type { LinkDetail, LinkLighthouseData, PageAnalysis } from '@/types/report';
import { useReport } from '../../../context/useReport';
import { strings, format } from '../../../lib/strings';
import {
  rtColor,
  formatMs,
  wcLabel,
  readingLabel,
  titleCharColor,
  metaCharColor,
  parseKeywords,
  normaliseKw,
  formatLhMetric,
} from '../../../utils/linkUtils';
import { scoreBandColor } from '../../../utils/chartPalette';
import CopyBtn from '../CopyBtn';
import CharBar from '../CharBar';

export interface OverviewTabProps {
  link: LinkDetail;
  lhData?: LinkLighthouseData | null;
  onOpenTab?: (tab: string, section?: string) => void;
}

function SectionLink({
  label,
  tab,
  section,
  onOpenTab,
}: {
  label: string;
  tab: string;
  section?: string;
  onOpenTab?: (tab: string, section?: string) => void;
}) {
  if (!onOpenTab) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenTab(tab, section)}
      className="inline-flex items-center gap-0.5 text-xs text-link hover:underline font-medium"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function SocialCheckItem({ label, present }: { label: string; present: boolean }) {
  const lc = strings.components.linkTabs.content;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-muted/50 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          present ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {present ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
        {present ? lc.socialPresent : lc.socialMissing}
      </span>
    </div>
  );
}

export default function OverviewTab({ link, lhData, onOpenTab }: OverviewTabProps) {
  const o = strings.components.linkTabs.overview;
  const sj = strings.common;
  const lhLabels = strings.lighthouse.categoryLabels as Record<string, string>;
  const { data } = useReport();
  const pa: PageAnalysis =
    link.page_analysis && typeof link.page_analysis === 'object' ? link.page_analysis : {};

  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const titleLen = (link.title || '').length;
  const metaLen = link.meta_description_len || (link.meta_description || '').length;

  const lh = lhData ?? link.lighthouse ?? null;
  const keywords = useMemo(() => parseKeywords(link.top_keywords).slice(0, 8), [link.top_keywords]);
  const sslExp = (data?.site_ssl_expires_at || null) as string | null;

  const crawlStats = [
    { key: 'status', label: o.statStatus, value: <Badge value={link.status ?? ''} />, raw: true },
    {
      key: 'responseTime',
      label: <LabelWithHint label={o.statResponseTime} helpKey="shared.responseTime" />,
      value: <span className={`font-bold ${rtColor(link.response_time_ms)}`}>{formatMs(link.response_time_ms)}</span>,
      raw: true,
    },
    { key: 'depth', label: <LabelWithHint label={o.statDepth} helpKey="shared.crawlDepth" />, value: link.depth != null ? link.depth : sj.emDash },
    { key: 'inlinks', label: <LabelWithHint label={o.statInlinks} helpKey="shared.inlinks" />, value: link.inlinks ?? 0 },
    { key: 'outlinks', label: <LabelWithHint label={o.statOutlinks} helpKey="shared.outlinks" />, value: link.outlinks ?? 0 },
    {
      key: 'words',
      label: <LabelWithHint label={o.statWords} helpKey="shared.wordCount" />,
      value:
        wc > 0 ? (
          <span className={wcInfo.color}>
            {wc.toLocaleString()} <span className="text-xs font-normal">{wcInfo.label}</span>
          </span>
        ) : (
          sj.emDash
        ),
      raw: true,
    },
    {
      key: 'readingLevel',
      label: <LabelWithHint label={o.statReadingLevel} helpKey="shared.readingLevel" />,
      value:
        rl > 0 ? (
          <span className={rlInfo.color}>
            {format(o.readingGrade, { n: rl })} <span className="text-xs font-normal">{rlInfo.label}</span>
          </span>
        ) : (
          sj.emDash
        ),
      raw: true,
    },
    {
      key: 'redirects',
      label: o.statRedirects,
      value:
        (link.redirect_chain_length ?? 0) > 0 ? (
          <span className="text-yellow-800 dark:text-yellow-400">{link.redirect_chain_length}</span>
        ) : (
          '0'
        ),
      raw: true,
    },
  ];

  const compositionStats = [
    {
      label: o.statInternalLinks,
      value: pa.internal_link_count ?? link.internal_link_count ?? sj.emDash,
    },
    {
      label: o.statExternalLinks,
      value: pa.external_link_count ?? link.external_link_count ?? sj.emDash,
    },
    { label: o.statImages, value: link.images_total ?? sj.emDash },
    { label: o.statScripts, value: link.script_count ?? sj.emDash },
    { label: o.statStylesheets, value: link.link_stylesheet_count ?? sj.emDash },
    {
      label: o.statPreload,
      value: `${pa.preload_count ?? 0} / ${pa.preconnect_count ?? 0}`,
    },
  ];

  const hasOg = !!(link.og_title && String(link.og_title).trim());
  const hasTwitter = !!(link.twitter_title && String(link.twitter_title).trim());
  const hasOgImg = !!(link.og_image && String(link.og_image).trim());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{o.crawlHeading}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {crawlStats.map(({ key, label, value, raw }) => (
            <div key={key} className="bg-brand-900 border border-default rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-sm font-semibold">
                {raw ? value : <span className="text-bright">{value}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{o.compositionHeading}</h3>
          <SectionLink label={o.openPageAnalysis} tab="analysis" section="resources" onOpenTab={onOpenTab} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {compositionStats.map(({ label, value }) => (
            <div key={label} className="bg-brand-900 border border-default rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-sm font-semibold text-bright">{value}</div>
            </div>
          ))}
        </div>
        {sslExp && (
          <p className="text-xs text-muted-foreground mt-2 font-mono">
            {o.sslExpires}: {sslExp.slice(0, 10)}
          </p>
        )}
      </div>

      {lh && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              {o.lighthouseHeading}
            </h3>
            <SectionLink label={o.openIssues} tab="issues" onOpenTab={onOpenTab} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {['performance', 'accessibility', 'best-practices', 'seo'].map((cat) => {
              const cs = lh.category_scores || {};
              const score = cs[cat] != null ? Number(cs[cat]) : null;
              const color = score != null ? scoreBandColor(score) : 'rgb(71,85,105)';
              return (
                <div key={cat} className="bg-brand-900 rounded-xl p-3 border border-default text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    {lhLabels[cat] || cat.replace('-', ' ')}
                  </div>
                  <div className="text-xl font-bold" style={{ color }}>
                    {score != null ? score : sj.emDash}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-brand-900 border border-default rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{o.socialHeading}</h3>
            <SectionLink label={o.openSeoSocial} tab="seo" onOpenTab={onOpenTab} />
          </div>
          <SocialCheckItem label={o.socialOgTitle} present={hasOg} />
          <SocialCheckItem label={o.socialTwitter} present={hasTwitter} />
          <SocialCheckItem label={o.socialOgImage} present={hasOgImg} />
        </div>

        {keywords.length > 0 && (
          <div className="bg-brand-900 border border-default rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{o.topKeywordsHeading}</h3>
              <SectionLink label={o.openContent} tab="content" onOpenTab={onOpenTab} />
            </div>
            <ul className="flex flex-wrap gap-2">
              {keywords.map((kw, i) => {
                const { word, count } = normaliseKw(kw);
                return (
                  <li
                    key={`${word}-${i}`}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-800 border border-default text-foreground"
                  >
                    {word}
                    {count != null && <span className="text-muted-foreground ml-1">({count})</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {link.content_type && (
        <div className="bg-brand-900 border border-default rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">{o.contentType}</div>
          <div className="text-xs font-mono text-foreground">{link.content_type}</div>
        </div>
      )}

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">{o.fieldTitle}</div>
          <CopyBtn text={link.title} />
        </div>
        <div className="text-sm text-foreground">
          {link.title || <span className="text-red-600 dark:text-red-400">{o.missing}</span>}
        </div>
        <CharBar len={titleLen} max={60} colorFn={titleCharColor} />
      </div>

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">{o.fieldMetaDesc}</div>
          <CopyBtn text={link.meta_description} />
        </div>
        <div className="text-sm text-foreground">
          {link.meta_description || <span className="text-red-600 dark:text-red-400">{o.missing}</span>}
        </div>
        <CharBar len={metaLen} max={160} colorFn={metaCharColor} />
      </div>

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">{o.fieldH1}</div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                link.h1_count === 1
                  ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                  : link.h1_count === 0
                    ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                    : 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-400'
              }`}
            >
              {format(o.h1Count, { n: link.h1_count ?? 0, s: link.h1_count !== 1 ? 's' : '' })}
            </span>
            <CopyBtn text={link.h1} />
          </div>
        </div>
        <div className="text-sm text-foreground">{link.h1 || <span className="text-muted-foreground">{sj.emDash}</span>}</div>
      </div>
    </div>
  );
}
