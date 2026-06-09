import { applyPreset, getPresetById, type PipelinePresetId } from '@/components/pipeline/pipelinePresets';
import { applyCrawlPreset, getCrawlPresetById, isCrawlPresetId, type CrawlPresetId } from '@/lib/crawlPresets';
import type { PipelineConfigState } from '@/types/api';

type EstimateTier = 'typical' | 'limit';

export interface PipelineRunPhase {
  id: string;
  label: string;
  detail?: string;
}

export type PipelineTimingPhase =
  | 'config'
  | 'crawl'
  | 'lighthouse'
  | 'report'
  | 'keywords'
  | 'plot'
  | 'optional';

export interface PipelinePhaseTiming {
  phase: PipelineTimingPhase;
  typicalSeconds: number;
  limitSeconds: number;
}

export interface PipelineRunPreview {
  phases: PipelineRunPhase[];
  maxCrawlPages: number | null;
  typicalCrawlPages: number | null;
  lighthousePages: number | null;
  timeMinSeconds: number;
  timeMaxSeconds: number;
  phaseTimings: PipelinePhaseTiming[];
  configRows: { label: string; value: string }[];
  summaryLines: string[];
}

function isTruthy(value: string | boolean | undefined, defaultWhenUnset = false): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return defaultWhenUnset;
}

function num(value: string | boolean | undefined, fallback: number): number {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : fallback;
}

function renderModeLabel(mode: string): string {
  if (mode === 'javascript') return 'JavaScript (browser)';
  if (mode === 'auto') return 'Auto (static + JS when needed)';
  return 'Static HTML';
}

function formatDurationRange(minSeconds: number, maxSeconds: number): string {
  const fmt = (sec: number) => {
    if (sec < 90) return `${Math.max(1, Math.round(sec))} sec`;
    if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min`;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  };
  if (maxSeconds <= minSeconds * 1.15) {
    return `~${fmt(minSeconds)}`;
  }
  return `${fmt(minSeconds)} – ${fmt(maxSeconds)}`;
}

export function formatPipelineRunDuration(minSeconds: number, maxSeconds: number): string {
  return formatDurationRange(minSeconds, maxSeconds);
}

interface RunPlan {
  command: string;
  state: PipelineConfigState;
  includesCrawl: boolean;
  includesReport: boolean;
  includesPlot: boolean;
  includesStandaloneLighthouse: boolean;
  includesLighthouseOnPages: boolean;
  includesGoogle: boolean;
  includesKeywords: boolean;
}

function resolveRunPlan(
  presetId: PipelinePresetId,
  configState: PipelineConfigState,
  customCommand: string,
): RunPlan {
  const preset = getPresetById(presetId);
  const command = customCommand.trim() || preset.command;
  const { configState: state } = applyPreset(presetId, configState);

  const includesCrawl =
    command === 'crawl' ||
    (!command && isTruthy(state.run_crawl, true));
  const includesReport =
    command === 'report' ||
    (!command && isTruthy(state.run_report, true));
  const includesPlot = !command && isTruthy(state.run_plot, true);
  const includesStandaloneLighthouse =
    command === 'lighthouse' ||
    (!command &&
      isTruthy(state.run_lighthouse, true) &&
      !isTruthy(state.run_lighthouse_on_pages, true));
  const includesLighthouseOnPages =
    !command && isTruthy(state.run_lighthouse_on_pages, true) && includesCrawl;
  const includesGoogle = command === 'google';
  const includesKeywords = command.startsWith('keywords');

  return {
    command,
    state,
    includesCrawl,
    includesReport,
    includesPlot,
    includesStandaloneLighthouse,
    includesLighthouseOnPages,
    includesGoogle,
    includesKeywords,
  };
}

/** Pages likely discovered before hitting the configured crawl cap. */
function typicalDiscoveredPages(maxPages: number): number {
  if (maxPages <= 75) return maxPages;
  return Math.min(maxPages, Math.max(40, Math.round(maxPages * 0.06)));
}

function lighthouseSamplePages(
  configured: number,
  crawlPages: number,
  tier: EstimateTier,
): number {
  const capped = Math.min(Math.max(0, configured), crawlPages);
  if (capped <= 0) return 0;
  if (tier === 'limit') return capped;
  if (capped <= 5) return capped;
  return Math.min(capped, Math.max(2, Math.round(capped * 0.25)));
}

function estimateCrawlSeconds(
  state: PipelineConfigState,
  pages: number,
  tier: EstimateTier,
): number {
  if (pages <= 0) return 0;
  const concurrency = Math.max(1, num(state.concurrency, 8));
  const politeDelay = Math.max(0, num(state.polite_delay, 0.2));
  const renderMode = String(state.crawl_render_mode ?? 'static').toLowerCase();
  const perPage =
    renderMode === 'javascript' ? 4.8 : renderMode === 'auto' ? 2.4 : 1.0;
  const batchSeconds = (pages / concurrency) * (perPage + politeDelay);
  const variance = tier === 'typical' ? 0.9 : 1.2;
  return batchSeconds * variance;
}

function estimateLighthouseSeconds(
  pageCount: number,
  concurrency: number,
  tier: EstimateTier,
): number {
  if (pageCount <= 0) return 0;
  const workers = Math.max(1, concurrency);
  const perPageWall = 38;
  const startup = 12;
  const batch = startup + (pageCount / workers) * perPageWall;
  return batch * (tier === 'typical' ? 0.92 : 1.12);
}

function estimateReportSeconds(pages: number, tier: EstimateTier): number {
  if (pages <= 0) return tier === 'typical' ? 20 : 35;
  const base = tier === 'typical' ? 25 : 55;
  const perPage = tier === 'typical' ? 0.012 : 0.035;
  return base + pages * perPage;
}

function resolvePreviewState(
  configState: PipelineConfigState,
  crawlPresetId: CrawlPresetId | '',
): PipelineConfigState {
  if (crawlPresetId && isCrawlPresetId(crawlPresetId)) {
    return applyCrawlPreset(crawlPresetId, configState);
  }
  return configState;
}

export function buildPipelineRunPreview({
  presetId,
  configState,
  customCommand = '',
  crawlPresetId = '',
}: {
  presetId: PipelinePresetId;
  configState: PipelineConfigState;
  customCommand?: string;
  crawlPresetId?: CrawlPresetId | '';
}): PipelineRunPreview {
  const mergedConfig = resolvePreviewState(configState, crawlPresetId);
  const plan = resolveRunPlan(presetId, mergedConfig, customCommand);
  const { state } = plan;

  const maxCrawlPages = plan.includesCrawl ? num(state.max_pages, 500) : null;
  const typicalCrawlPages =
    maxCrawlPages != null ? typicalDiscoveredPages(maxCrawlPages) : null;
  const lhConfigured = plan.includesLighthouseOnPages
    ? num(state.lighthouse_max_pages, 2)
    : null;
  const lhOnPages =
    lhConfigured != null && maxCrawlPages != null
      ? Math.min(lhConfigured, maxCrawlPages)
      : lhConfigured;
  const lhStandalone = plan.includesStandaloneLighthouse ? 1 : null;
  const lighthousePages = lhOnPages ?? lhStandalone;

  const phases: PipelineRunPhase[] = [];
  if (plan.includesCrawl && maxCrawlPages != null) {
    phases.push({
      id: 'crawl',
      label: 'Site crawl',
      detail: `Up to ${maxCrawlPages.toLocaleString()} URLs`,
    });
  }
  if (plan.includesReport) {
    phases.push({ id: 'report', label: 'Audit report', detail: 'Issues, links, and on-page analysis' });
  }
  if (plan.includesPlot) {
    phases.push({ id: 'plot', label: 'Charts & exports', detail: 'Visual summaries and data files' });
  }
  if (plan.includesLighthouseOnPages && lighthousePages != null) {
    phases.push({
      id: 'lighthouse-pages',
      label: 'Lighthouse (sampled pages)',
      detail: `${lighthousePages.toLocaleString()} URL${lighthousePages === 1 ? '' : 's'}`,
    });
  }
  if (plan.includesStandaloneLighthouse) {
    phases.push({
      id: 'lighthouse-single',
      label: 'Lighthouse (single URL)',
      detail: String(state.lighthouse_url || state.start_url || 'Start URL').trim() || 'Start URL',
    });
  }
  if (plan.includesGoogle) {
    phases.push({ id: 'google', label: 'Google Search Console sync', detail: 'GSC + GA4 data pull' });
  }
  if (plan.includesKeywords) {
    phases.push({ id: 'keywords', label: 'Keywords explorer', detail: 'GSC keywords with optional enrichment' });
  }

  let timeMin = 0;
  let timeMax = 0;
  const lhConcurrency = num(state.lighthouse_concurrency, 2);

  if (plan.includesCrawl && maxCrawlPages != null && typicalCrawlPages != null) {
    timeMin += estimateCrawlSeconds(state, typicalCrawlPages, 'typical');
    timeMax += estimateCrawlSeconds(state, maxCrawlPages, 'limit');
  }
  if (plan.includesReport) {
    const typicalPages = typicalCrawlPages ?? num(state.analysis_dup_max_pages, 2000);
    const limitPages = maxCrawlPages ?? num(state.analysis_dup_max_pages, 2000);
    timeMin += estimateReportSeconds(typicalPages, 'typical');
    timeMax += estimateReportSeconds(limitPages, 'limit');
  }
  if (plan.includesPlot) {
    timeMin += 15;
    timeMax += 45;
  }
  if (lhOnPages != null && lhOnPages > 0 && typicalCrawlPages != null && maxCrawlPages != null) {
    const lhTypical = lighthouseSamplePages(lhOnPages, typicalCrawlPages, 'typical');
    const lhLimit = lighthouseSamplePages(lhOnPages, maxCrawlPages, 'limit');
    timeMin += estimateLighthouseSeconds(lhTypical, lhConcurrency, 'typical');
    timeMax += estimateLighthouseSeconds(lhLimit, lhConcurrency, 'limit');
  } else if (plan.includesStandaloneLighthouse) {
    timeMin += estimateLighthouseSeconds(1, 1, 'typical');
    timeMax += estimateLighthouseSeconds(1, 1, 'limit');
  }
  if (plan.includesGoogle) {
    timeMin += 120;
    timeMax += 360;
  }
  if (plan.includesKeywords) {
    timeMin += 180;
    timeMax += 720;
  }

  timeMin = Math.max(15, Math.round(timeMin));
  timeMax = Math.max(timeMin + 10, Math.round(timeMax));

  const phaseTimings: PipelinePhaseTiming[] = [];
  const hasMultiStep =
    plan.includesCrawl ||
    plan.includesReport ||
    plan.includesPlot ||
    plan.includesLighthouseOnPages ||
    plan.includesStandaloneLighthouse ||
    plan.includesGoogle ||
    plan.includesKeywords;
  if (hasMultiStep && !plan.command) {
    phaseTimings.push({ phase: 'config', typicalSeconds: 3, limitSeconds: 8 });
  }
  if (plan.includesCrawl && maxCrawlPages != null && typicalCrawlPages != null) {
    phaseTimings.push({
      phase: 'crawl',
      typicalSeconds: estimateCrawlSeconds(state, typicalCrawlPages, 'typical'),
      limitSeconds: estimateCrawlSeconds(state, maxCrawlPages, 'limit'),
    });
  }
  if (lhOnPages != null && lhOnPages > 0 && typicalCrawlPages != null && maxCrawlPages != null) {
    phaseTimings.push({
      phase: 'lighthouse',
      typicalSeconds: estimateLighthouseSeconds(
        lighthouseSamplePages(lhOnPages, typicalCrawlPages, 'typical'),
        lhConcurrency,
        'typical',
      ),
      limitSeconds: estimateLighthouseSeconds(
        lighthouseSamplePages(lhOnPages, maxCrawlPages, 'limit'),
        lhConcurrency,
        'limit',
      ),
    });
  } else if (plan.includesStandaloneLighthouse) {
    phaseTimings.push({
      phase: 'lighthouse',
      typicalSeconds: estimateLighthouseSeconds(1, 1, 'typical'),
      limitSeconds: estimateLighthouseSeconds(1, 1, 'limit'),
    });
  }
  if (plan.includesReport) {
    const typicalPages = typicalCrawlPages ?? num(state.analysis_dup_max_pages, 2000);
    const limitPages = maxCrawlPages ?? num(state.analysis_dup_max_pages, 2000);
    phaseTimings.push({
      phase: 'report',
      typicalSeconds: estimateReportSeconds(typicalPages, 'typical'),
      limitSeconds: estimateReportSeconds(limitPages, 'limit'),
    });
  }
  if (plan.includesKeywords) {
    phaseTimings.push({ phase: 'keywords', typicalSeconds: 180, limitSeconds: 720 });
  }
  if (plan.includesPlot) {
    phaseTimings.push({ phase: 'plot', typicalSeconds: 15, limitSeconds: 45 });
  }
  if (plan.includesGoogle) {
    phaseTimings.push({ phase: 'keywords', typicalSeconds: 120, limitSeconds: 360 });
  }

  const renderMode = String(state.crawl_render_mode ?? 'static');
  const crawlPresetLabel =
    crawlPresetId && isCrawlPresetId(crawlPresetId)
      ? getCrawlPresetById(crawlPresetId).label
      : null;

  const configRows: { label: string; value: string }[] = [];

  if (plan.includesCrawl) {
    configRows.push(
      { label: 'Crawl limit', value: `${maxCrawlPages?.toLocaleString() ?? '—'} URLs` },
      { label: 'Render mode', value: renderModeLabel(renderMode) },
      { label: 'Concurrent requests', value: String(num(state.concurrency, 8)) },
      { label: 'Crawl delay', value: `${num(state.polite_delay, 0.2)}s` },
      { label: 'Max depth', value: String(num(state.max_depth, 6)) },
    );
    if (crawlPresetLabel) {
      configRows.push({ label: 'Crawl preset', value: crawlPresetLabel });
    }
  }
  if (plan.includesLighthouseOnPages || plan.includesStandaloneLighthouse) {
    configRows.push(
      {
        label: 'Lighthouse strategy',
        value: String(state.lighthouse_strategy || 'mobile'),
      },
      {
        label: 'Lighthouse URLs',
        value: lighthousePages != null ? String(lighthousePages) : '—',
      },
    );
  }
  if (plan.includesReport) {
    configRows.push({
      label: 'Property name',
      value: String(state.site_name || '').trim() || '(from site URL)',
    });
  }

  const summaryLines: string[] = [];
  if (plan.includesCrawl && maxCrawlPages != null) {
    summaryLines.push(
      `Crawls up to ${maxCrawlPages.toLocaleString()} pages using ${renderModeLabel(renderMode).toLowerCase()}.`,
    );
  }
  if (plan.includesReport) {
    summaryLines.push('Builds a full SEO audit report from crawl data.');
  }
  if (lighthousePages != null && lighthousePages > 0) {
    summaryLines.push(`Runs Lighthouse on ${lighthousePages.toLocaleString()} page(s).`);
  }
  if (plan.includesGoogle) {
    summaryLines.push('Pulls Search Console and Analytics metrics.');
  }
  if (plan.includesKeywords) {
    summaryLines.push('Generates keyword clusters from Search Console.');
  }
  if (summaryLines.length === 0) {
    summaryLines.push('Review settings below before starting.');
  }

  return {
    phases,
    maxCrawlPages,
    typicalCrawlPages,
    lighthousePages,
    timeMinSeconds: timeMin,
    timeMaxSeconds: timeMax,
    phaseTimings,
    configRows,
    summaryLines,
  };
}
