import { applyPreset, getPresetById, type PipelinePresetId } from '@/components/pipeline/pipelinePresets';
import { getCrawlPresetById, isCrawlPresetId, type CrawlPresetId } from '@/lib/crawlPresets';
import type { PipelineConfigState } from '@/types/api';

export interface PipelineRunPhase {
  id: string;
  label: string;
  detail?: string;
}

export interface PipelineRunPreview {
  phases: PipelineRunPhase[];
  maxCrawlPages: number | null;
  lighthousePages: number | null;
  timeMinSeconds: number;
  timeMaxSeconds: number;
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

function estimateCrawlSeconds(state: PipelineConfigState, maxPages: number): { min: number; max: number } {
  const concurrency = Math.max(1, num(state.concurrency, 8));
  const politeDelay = Math.max(0, num(state.polite_delay, 0.2));
  const renderMode = String(state.crawl_render_mode ?? 'static').toLowerCase();
  const perPage =
    renderMode === 'javascript' ? 5.5 : renderMode === 'auto' ? 2.8 : 1.1;
  const batchSeconds = (maxPages / concurrency) * (perPage + politeDelay);
  return { min: batchSeconds * 0.75, max: batchSeconds * 1.35 };
}

function estimateLighthouseSeconds(pageCount: number, concurrency: number): { min: number; max: number } {
  const c = Math.max(1, concurrency);
  const batch = (pageCount / c) * 55;
  return { min: batch * 0.85, max: batch * 1.25 };
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
  const plan = resolveRunPlan(presetId, configState, customCommand);
  const { state } = plan;

  const maxCrawlPages = plan.includesCrawl ? num(state.max_pages, 500) : null;
  const lhOnPages = plan.includesLighthouseOnPages
    ? num(state.lighthouse_max_pages, 2)
    : null;
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

  if (plan.includesCrawl && maxCrawlPages != null) {
    const crawl = estimateCrawlSeconds(state, maxCrawlPages);
    timeMin += crawl.min;
    timeMax += crawl.max;
  }
  if (plan.includesReport) {
    const pages = maxCrawlPages ?? num(state.analysis_dup_max_pages, 2000);
    timeMin += 30 + pages * 0.02;
    timeMax += 90 + pages * 0.06;
  }
  if (plan.includesPlot) {
    timeMin += 20;
    timeMax += 60;
  }
  if (lighthousePages != null && lighthousePages > 0) {
    const lh = estimateLighthouseSeconds(
      lighthousePages,
      num(state.lighthouse_concurrency, 2),
    );
    timeMin += lh.min;
    timeMax += lh.max;
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
    lighthousePages,
    timeMinSeconds: timeMin,
    timeMaxSeconds: timeMax,
    configRows,
    summaryLines,
  };
}
