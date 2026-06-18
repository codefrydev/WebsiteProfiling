import { useMemo, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  FileCode,
  FileText,
  Gauge,
  Image,
  Layers,
  Link2,
  Route,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { Badge, Card, StatCard } from '../../index';
import { LighthouseScoreGrid } from '@/components/charts/LighthouseScoreGrid';
import { metricHelpHint } from '@/lib/metricHelp';
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

function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h3>
      {action}
    </div>
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

  const crawlMetrics = [
    {
      key: 'status',
      icon: <Activity className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statStatus,
      value: <Badge value={link.status ?? ''} />,
    },
    {
      key: 'responseTime',
      icon: <Timer className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statResponseTime,
      hint: metricHelpHint('shared.responseTime'),
      value: formatMs(link.response_time_ms),
      valueClassName: rtColor(link.response_time_ms),
    },
    {
      key: 'depth',
      icon: <Layers className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statDepth,
      hint: metricHelpHint('shared.crawlDepth'),
      value: link.depth != null ? link.depth : sj.emDash,
    },
    {
      key: 'inlinks',
      icon: <ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statInlinks,
      hint: metricHelpHint('shared.inlinks'),
      value: link.inlinks ?? 0,
    },
    {
      key: 'outlinks',
      icon: <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statOutlinks,
      hint: metricHelpHint('shared.outlinks'),
      value: link.outlinks ?? 0,
    },
    {
      key: 'words',
      icon: <FileText className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statWords,
      hint: metricHelpHint('shared.wordCount'),
      value: wc > 0 ? wc.toLocaleString() : sj.emDash,
      band: wc > 0 ? wcInfo.label : undefined,
      bandClassName: wc > 0 ? wcInfo.color : undefined,
      valueClassName: wc > 0 ? wcInfo.color : 'text-muted-foreground',
    },
    {
      key: 'readingLevel',
      icon: <BookOpen className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statReadingLevel,
      hint: metricHelpHint('shared.readingLevel'),
      value: rl > 0 ? format(o.readingGrade, { n: rl }) : sj.emDash,
      band: rl > 0 ? rlInfo.label : undefined,
      bandClassName: rl > 0 ? rlInfo.color : undefined,
      valueClassName: rl > 0 ? rlInfo.color : 'text-muted-foreground',
    },
    {
      key: 'redirects',
      icon: <Route className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statRedirects,
      value: link.redirect_chain_length ?? 0,
      valueClassName:
        (link.redirect_chain_length ?? 0) > 0
          ? 'text-yellow-800 dark:text-yellow-400'
          : 'text-bright',
    },
  ];

  const compositionMetrics = [
    {
      key: 'internal',
      icon: <Link2 className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statInternalLinks,
      value: pa.internal_link_count ?? link.internal_link_count ?? sj.emDash,
    },
    {
      key: 'external',
      icon: <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statExternalLinks,
      value: pa.external_link_count ?? link.external_link_count ?? sj.emDash,
    },
    {
      key: 'images',
      icon: <Image className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statImages,
      value: link.images_total ?? sj.emDash,
    },
    {
      key: 'scripts',
      icon: <FileCode className="h-4 w-4 shrink-0" aria-hidden />,
      label: o.statScripts,
      value: link.script_count ?? sj.emDash,
    },
    {
      key: 'stylesheets',
      icon: <FileCode className="h-4 w-4 shrink-0 text-purple-700 dark:text-purple-400" aria-hidden />,
      label: o.statStylesheets,
      value: link.link_stylesheet_count ?? sj.emDash,
    },
    {
      key: 'preload',
      icon: <Zap className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />,
      label: o.statPreload,
      value: `${pa.preload_count ?? 0} / ${pa.preconnect_count ?? 0}`,
    },
  ];

  const cwvMetrics = lh
    ? ([
        ['LCP', 'lcp_ms'],
        ['FCP', 'fcp_ms'],
        ['TBT', 'tbt_ms'],
        ['CLS', 'cls'],
      ] as const).map(([label, key]) => ({
        key,
        label,
        value: formatLhMetric(key, lh.median_metrics?.[key]),
      }))
    : [];

  const hasOg = !!(link.og_title && String(link.og_title).trim());
  const hasTwitter = !!(link.twitter_title && String(link.twitter_title).trim());
  const hasOgImg = !!(link.og_image && String(link.og_image).trim());

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title={o.crawlHeading} />
        <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
          {crawlMetrics.map(
            ({ key, icon, label, hint, value, valueClassName, band, bandClassName }) => (
              <StatCard
                key={key}
                shadow
                fillHeight
                icon={icon}
                label={label}
                hint={hint}
                value={value}
                valueClassName={valueClassName}
                band={band}
                bandClassName={bandClassName}
              />
            ),
          )}
        </div>
      </div>

      <div>
        <SectionHeader
          title={o.compositionHeading}
          action={<SectionLink label={o.openPageAnalysis} tab="analysis" section="resources" onOpenTab={onOpenTab} />}
        />
        <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {compositionMetrics.map(({ key, icon, label, value }) => (
            <StatCard key={key} shadow fillHeight icon={icon} label={label} value={value} />
          ))}
        </div>
        {sslExp && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {o.sslExpires}: {sslExp.slice(0, 10)}
          </p>
        )}
      </div>

      {lh && (
        <div>
          <SectionHeader
            title={o.lighthouseHeading}
            icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
            action={<SectionLink label={o.openIssues} tab="issues" onOpenTab={onOpenTab} />}
          />
          <Card shadow padding="tight" className="space-y-4">
            <div className="flex justify-center">
              <LighthouseScoreGrid
                scores={lh.category_scores || {}}
                categoryLabels={lhLabels}
                aria={o.lighthouseHeading}
                size="sm"
              />
            </div>
            {cwvMetrics.length > 0 ? (
              <div className="border-t border-muted/50 pt-4">
                <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
                  {cwvMetrics.map(({ key, label, value }) => (
                    <StatCard
                      key={key}
                      shadow
                      fillHeight
                      label={label}
                      value={value}
                      valueClassName="font-mono text-xl"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
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
