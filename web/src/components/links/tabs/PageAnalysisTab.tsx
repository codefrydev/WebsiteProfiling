import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronRight, FolderOpen, Sparkles, Terminal } from 'lucide-react';
import type { LinkDetail, NlpSignals, PageAnalysis, ReportLink, SimilarInternalRow } from '@/types/report';
import ViewTabs from '@/components/ViewTabs';
import { ViewTabPanel } from '@/components/ViewTabPanel';
import BrowserDiagnosticsPanel from '../../browser/BrowserDiagnosticsPanel';
import { linkHasBrowserErrors } from '@/lib/browserErrors';
import { parseUrlTab } from '@/hooks/useUrlTab';
import { severityBg } from '../../../utils/linkUtils';
import { strings, format } from '../../../lib/strings';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildOnPageWarningContext } from '@/lib/fixSuggestionContext';

const SECTION_TABS = ['insights', 'browser', 'warnings', 'resources'] as const;
type PageAnalysisSection = (typeof SECTION_TABS)[number];

function normalizeSimilarInternal(raw: unknown): SimilarInternalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): SimilarInternalRow | null => {
      if (typeof item === 'string') return { url: item, score: null };
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string') {
        const obj = item as Record<string, unknown>;
        const sc = obj.score;
        return {
          url: obj.url as string,
          score: sc != null && sc !== '' ? Number(sc) : null,
        };
      }
      return null;
    })
    .filter((row): row is SimilarInternalRow => row != null);
}

function defaultSection(link: LinkDetail, pa: PageAnalysis): PageAnalysisSection {
  if (linkHasBrowserErrors(link as ReportLink)) return 'browser';
  const warnings = Array.isArray(pa.warnings) ? pa.warnings.length : 0;
  if (warnings > 0) return 'warnings';
  const nlp = link.nlp_entities || pa?.signals?.nlp_entities;
  const hasIntelligence =
    Boolean(link.duplicate_group_id) ||
    normalizeSimilarInternal(link.similar_internal).length > 0 ||
    Boolean(link.detected_language) ||
    Boolean(link.keyphrases?.phrases?.length) ||
    Boolean(
      nlp &&
        (nlp.entity_count != null || (nlp.top_entity_labels && nlp.top_entity_labels.length > 0)),
    );
  if (hasIntelligence) return 'insights';
  const hasResources = strings.components.linkTabs.pageAnalysis.resourceSections.some(({ key }) => {
    const urls = pa[key as keyof PageAnalysis];
    return Array.isArray(urls) && urls.length > 0;
  });
  if (hasResources) return 'resources';
  return 'insights';
}

interface NerBlockProps {
  nlp: NlpSignals | undefined;
}

function NerBlock({ nlp }: NerBlockProps) {
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

function resolveResourceUrl(raw: string | null | undefined, pageUrl: string): string | null {
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

interface ResourceSectionProps {
  title: string;
  urls: string[] | undefined;
  pageUrl: string;
}

const RESOURCE_URL_CAP = 12;

function ResourceSection({ title, urls, pageUrl }: ResourceSectionProps) {
  const p = strings.components.linkTabs.pageAnalysis;
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const list = Array.isArray(urls) ? urls : [];
  const shown = showAll ? list : list.slice(0, RESOURCE_URL_CAP);

  if (list.length === 0) return null;

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
        <div className="px-4 pb-3 border-t border-muted max-h-64 overflow-y-auto">
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
          {list.length > RESOURCE_URL_CAP && (
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

function InsightsPanel({
  link,
  pa,
  nlpSignals,
  similarRows,
  hasIntelligence,
}: {
  link: LinkDetail;
  pa: PageAnalysis;
  nlpSignals: NlpSignals | undefined;
  similarRows: SimilarInternalRow[];
  hasIntelligence: boolean;
}) {
  const p = strings.components.linkTabs.pageAnalysis;

  if (!hasIntelligence) {
    return <p className="text-sm text-muted-foreground">{p.noInsights}</p>;
  }

  return (
    <div className="border border-violet-400/30 dark:border-violet-500/20 rounded-xl p-4 bg-violet-100/45 dark:bg-violet-950/20 space-y-3">
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
        {link.keyphrases?.phrases && link.keyphrases.phrases.length > 0 && (
          <div className="bg-brand-900 border border-default rounded-lg p-3 sm:col-span-2">
            <div className="text-muted-foreground mb-2">{p.keyphrasesKeybert}</div>
            <ul className="flex flex-wrap gap-2">
              {link.keyphrases.phrases.slice(0, 12).map((pair: unknown, i: number) => {
                const phrasePair = Array.isArray(pair) ? pair : [pair];
                return (
                  <li
                    key={`${String(phrasePair[0])}-${i}`}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-800 border border-default text-emerald-800 dark:text-emerald-300/90"
                  >
                    {String(phrasePair[0])}
                    {typeof phrasePair[1] === 'number' && (
                      <span className="text-muted-foreground ml-1">({phrasePair[1].toFixed(2)})</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {link.keyphrases.phrases.length > 12 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {format(p.keyphrasesMore, { count: link.keyphrases.phrases.length - 12 })}
              </p>
            )}
          </div>
        )}
      </div>
      {similarRows.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-2">{p.similarInternalCaption}</div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {similarRows.slice(0, 8).map((row) => (
              <li key={row.url} className="flex flex-wrap items-baseline gap-2 gap-y-0">
                {row.score != null && !Number.isNaN(row.score) && (
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400/90 shrink-0 w-14">
                    {row.score.toFixed(4)}
                  </span>
                )}
                <a href={row.url} target="_blank" rel="noreferrer" className="text-link hover:underline font-mono text-xs break-all min-w-0">
                  {row.url}
                </a>
              </li>
            ))}
          </ul>
          {similarRows.length > 8 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              {format(p.similarMore, { count: similarRows.length - 8 })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function WarningsPanel({ pa, pageUrl }: { pa: PageAnalysis; pageUrl: string }) {
  const p = strings.components.linkTabs.pageAnalysis;
  const [sevFilter, setSevFilter] = useState('All');
  const filteredWarnings = useMemo(() => {
    const warnings = Array.isArray(pa.warnings) ? pa.warnings : [];
    if (sevFilter === 'All') return warnings;
    return warnings.filter((w) => (w.severity || '').toLowerCase() === sevFilter.toLowerCase());
  }, [pa.warnings, sevFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{format(p.onPageWarnings, { count: filteredWarnings.length })}</p>
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
              className="bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground space-y-2"
            >
              <div>
                <span className={`text-xs px-2 py-0.5 rounded mr-2 ${severityBg(w.severity)}`}>
                  {w.severity || 'info'}
                </span>
                {w.message}
                {w.detail && (
                  <div className="mt-1 text-xs text-muted-foreground font-mono break-all">{w.detail}</div>
                )}
              </div>
              <AiSuggestionButton request={buildOnPageWarningContext(w, pageUrl)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourcesPanel({
  pa,
  pageUrl,
  resourceSections,
}: {
  pa: PageAnalysis;
  pageUrl: string;
  resourceSections: Array<{ key: keyof PageAnalysis; label: string }>;
}) {
  const p = strings.components.linkTabs.pageAnalysis;

  if (resourceSections.length === 0) {
    return <p className="text-sm text-muted-foreground">{p.noResources}</p>;
  }

  return (
    <div className="space-y-2">
      {resourceSections.map(({ key, label }) => (
        <ResourceSection key={key} title={label} urls={pa[key] as string[] | undefined} pageUrl={pageUrl} />
      ))}
    </div>
  );
}

export interface PageAnalysisTabProps {
  link: LinkDetail;
}

export default function PageAnalysisTab({ link }: PageAnalysisTabProps) {
  const p = strings.components.linkTabs.pageAnalysis;
  const st = p.subTabs;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pa: PageAnalysis = link.page_analysis && typeof link.page_analysis === 'object' ? link.page_analysis : {};
  const nlpSignals = link.nlp_entities || pa?.signals?.nlp_entities;
  const similarRows = useMemo(() => normalizeSimilarInternal(link.similar_internal), [link.similar_internal]);

  const fallbackSection = useMemo(() => defaultSection(link, pa), [link, pa]);

  const activeSection = useMemo(
    () => parseUrlTab(searchParams.get('section'), SECTION_TABS, fallbackSection),
    [searchParams, fallbackSection],
  );

  const setActiveSection = useCallback(
    (section: PageAnalysisSection) => {
      const next = new URLSearchParams(searchParams.toString());
      if (section === fallbackSection) {
        next.delete('section');
      } else {
        next.set('section', section);
      }
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, fallbackSection],
  );

  const warningsCount = Array.isArray(pa.warnings) ? pa.warnings.length : 0;
  const hasBrowserIssues = linkHasBrowserErrors(link as ReportLink);

  const hasIntelligence =
    Boolean(link.duplicate_group_id) ||
    similarRows.length > 0 ||
    Boolean(link.detected_language) ||
    Boolean(link.keyphrases?.phrases?.length) ||
    Boolean(
      nlpSignals &&
        (nlpSignals.entity_count != null ||
          (nlpSignals.top_entity_labels && nlpSignals.top_entity_labels.length > 0)),
    );

  const resourceSections = p.resourceSections.filter(({ key }: { key: keyof PageAnalysis }) => {
    const urls = pa[key];
    return Array.isArray(urls) && urls.length > 0;
  });

  const resourceUrlCount = resourceSections.reduce((sum, { key }) => {
    const urls = pa[key as keyof PageAnalysis];
    return sum + (Array.isArray(urls) ? urls.length : 0);
  }, 0);

  const tabs = [
    { id: 'insights', label: st.insights, icon: <Sparkles className="h-3.5 w-3.5" /> },
    {
      id: 'browser',
      label: st.browser,
      icon: <Terminal className="h-3.5 w-3.5" />,
      badge: hasBrowserIssues ? 1 : null,
    },
    {
      id: 'warnings',
      label: st.warnings,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      badge: warningsCount > 0 ? warningsCount : null,
    },
    {
      id: 'resources',
      label: st.resources,
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      badge: resourceUrlCount > 0 ? resourceUrlCount : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed shrink-0">{p.intro}</p>

      <div className="shrink-0 border-b border-muted pb-2">
        <ViewTabs
          tabs={tabs}
          activeTab={activeSection}
          onChange={(id) => setActiveSection(id as PageAnalysisSection)}
          ariaLabel={p.subTabsAria}
          idPrefix="page-analysis"
        />
      </div>

      <div className="min-h-0">
        {activeSection === 'insights' && (
          <ViewTabPanel idPrefix="page-analysis" tabId="insights">
            <InsightsPanel
              link={link}
              pa={pa}
              nlpSignals={nlpSignals}
              similarRows={similarRows}
              hasIntelligence={hasIntelligence}
            />
          </ViewTabPanel>
        )}
        {activeSection === 'browser' && (
          <ViewTabPanel idPrefix="page-analysis" tabId="browser">
            <BrowserDiagnosticsPanel browser={pa.browser} />
          </ViewTabPanel>
        )}
        {activeSection === 'warnings' && (
          <ViewTabPanel idPrefix="page-analysis" tabId="warnings">
            <WarningsPanel pa={pa} pageUrl={link.url} />
          </ViewTabPanel>
        )}
        {activeSection === 'resources' && (
          <ViewTabPanel idPrefix="page-analysis" tabId="resources">
            <ResourcesPanel pa={pa} pageUrl={link.url} resourceSections={resourceSections} />
          </ViewTabPanel>
        )}
      </div>
    </div>
  );
}
