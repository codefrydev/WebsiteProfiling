import type {
  ReportCategory,
  ReportFingerprintDiff,
  ReportLink,
  ReportPayload,
  SeoHealthStats,
} from '@/types/report';
import { computeReportFingerprintDiff, normReportUrl } from './reportDiff';
import {
  buildReportCompareExtras,
  type CompareExtrasLabels,
  type ReportCompareExtras,
} from './reportCompareExtras';

export type {
  IssueDeltaRow,
  LighthouseUrlRow,
  LinkMetricRow,
  RedirectDeltaRow,
  SecurityDeltaRow,
  DuplicateDeltaRow,
  TechDeltaRow,
  PriorityCountRow,
} from './reportCompareExtras';

export interface CompareMetricRow {
  id: string;
  label: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  /** When true, a positive delta is shown as improvement (green). */
  higherIsBetter: boolean;
  format?: 'percent' | 'score' | 'count';
  /** Optional percent change vs baseline. */
  deltaPct?: number | null;
}

export interface CategoryScoreRow {
  id: string;
  name: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
}

export interface LinkStatusChangeRow {
  url: string;
  currentStatus: string;
  baselineStatus: string;
}

export interface UrlMetadataChangeRow {
  url: string;
  field: string;
  baseline: string;
  current: string;
}

export interface SeoHealthDeltaRow {
  id: string;
  label: string;
  current: number;
  baseline: number;
  delta: number;
  higherIsBetter: boolean;
}

export interface ReportCompareSummary {
  fingerprint: ReportFingerprintDiff;
  urlChangeListsAvailable: boolean;
  metrics: CompareMetricRow[];
  categoryScores: CategoryScoreRow[];
  seoHealth: SeoHealthDeltaRow[];
  statusChanges: LinkStatusChangeRow[];
  urlMetadataChanges: UrlMetadataChangeRow[];
  currentGeneratedAt: string | null;
  baselineGeneratedAt: string | null;
  extras: ReportCompareExtras;
}

export type { CompareExtrasLabels };

function scoreFromCategories(categories: ReportCategory[] = []): number | null {
  const numeric = categories
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  return Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length);
}

function countCategoryIssues(categories: ReportCategory[] = []): number {
  return categories.reduce((n, c) => n + (c.issues?.length ?? 0), 0);
}

function avgLighthouseScore(links: ReportLink[] | undefined, key: 'performance_score' | 'seo_score'): number | null {
  const vals: number[] = [];
  for (const l of links ?? []) {
    const v = l.lighthouse?.median_metrics?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaRow(
  id: string,
  label: string,
  current: number | null,
  baseline: number | null,
  higherIsBetter: boolean,
  format: CompareMetricRow['format'] = 'count',
): CompareMetricRow {
  const delta =
    current != null && baseline != null ? Math.round((current - baseline) * 10) / 10 : null;
  return { id, label, current, baseline, delta, higherIsBetter, format };
}

function buildLinkStatusChanges(current: ReportPayload, baseline: ReportPayload): LinkStatusChangeRow[] {
  const curMap = new Map<string, ReportLink>();
  for (const l of current.links ?? []) {
    const k = normReportUrl(l.url);
    if (k) curMap.set(k, l);
  }
  const out: LinkStatusChangeRow[] = [];
  for (const bl of baseline.links ?? []) {
    const k = normReportUrl(bl.url);
    if (!k) continue;
    const cl = curMap.get(k);
    if (!cl) continue;
    const curSt = String(cl.status ?? '').trim() || '—';
    const baseSt = String(bl.status ?? '').trim() || '—';
    if (curSt !== baseSt) {
      out.push({ url: cl.url || bl.url, currentStatus: curSt, baselineStatus: baseSt });
    }
  }
  out.sort((a, b) => a.url.localeCompare(b.url));
  return out;
}

const METADATA_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'canonical_url', label: 'Canonical' },
];

function buildUrlMetadataChanges(current: ReportPayload, baseline: ReportPayload): UrlMetadataChangeRow[] {
  const curMap = new Map<string, ReportLink>();
  for (const l of current.links ?? []) {
    const k = normReportUrl(l.url);
    if (k) curMap.set(k, l);
  }
  const out: UrlMetadataChangeRow[] = [];
  for (const bl of baseline.links ?? []) {
    const k = normReportUrl(bl.url);
    if (!k) continue;
    const cl = curMap.get(k);
    if (!cl) continue;
    for (const { key, label } of METADATA_FIELDS) {
      const curVal = String((cl as unknown as Record<string, unknown>)[key] ?? '').trim();
      const baseVal = String((bl as unknown as Record<string, unknown>)[key] ?? '').trim();
      if (curVal !== baseVal) {
        out.push({ url: cl.url || bl.url, field: label, baseline: baseVal, current: curVal });
      }
    }
  }
  out.sort((a, b) => a.url.localeCompare(b.url) || a.field.localeCompare(b.field));
  return out;
}

function categoryKey(cat: ReportCategory): string {
  return String(cat.id || cat.name || '').trim();
}

function buildCategoryScores(current: ReportPayload, baseline: ReportPayload): CategoryScoreRow[] {
  const baseMap = new Map<string, ReportCategory>();
  for (const c of baseline.categories ?? []) {
    const k = categoryKey(c);
    if (k) baseMap.set(k, c);
  }
  const rows: CategoryScoreRow[] = [];
  for (const c of current.categories ?? []) {
    const k = categoryKey(c);
    if (!k) continue;
    const b = baseMap.get(k);
    const curScore = num(c.score);
    const baseScore = b != null ? num(b.score) : null;
    const delta = curScore != null && baseScore != null ? curScore - baseScore : null;
    rows.push({
      id: k,
      name: String(c.name || c.id || k),
      current: curScore,
      baseline: baseScore,
      delta,
    });
  }
  rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  return rows;
}

const SEO_HEALTH_FIELDS: { key: keyof SeoHealthStats; label: string; higherIsBetter: boolean }[] = [
  { key: 'missing_title', label: 'Missing title', higherIsBetter: false },
  { key: 'title_ok', label: 'Title OK', higherIsBetter: true },
  { key: 'missing_meta_desc', label: 'Missing meta description', higherIsBetter: false },
  { key: 'meta_desc_ok', label: 'Meta description OK', higherIsBetter: true },
  { key: 'h1_zero', label: 'Pages with no H1', higherIsBetter: false },
  { key: 'h1_one', label: 'Pages with one H1', higherIsBetter: true },
  { key: 'h1_multi', label: 'Pages with multiple H1s', higherIsBetter: false },
  { key: 'thin_content', label: 'Thin content (flagged)', higherIsBetter: false },
];

function buildSeoHealthDeltas(current: ReportPayload, baseline: ReportPayload): SeoHealthDeltaRow[] {
  const cur = current.seo_health ?? {};
  const base = baseline.seo_health ?? {};
  const rows: SeoHealthDeltaRow[] = [];
  for (const { key, label, higherIsBetter } of SEO_HEALTH_FIELDS) {
    const c = Number(cur[key] ?? 0);
    const b = Number(base[key] ?? 0);
    if (c === b) continue;
    rows.push({
      id: key,
      label,
      current: c,
      baseline: b,
      delta: c - b,
      higherIsBetter,
    });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows;
}

/** Full comparison between newer `current` and older `baseline` payloads. */
export function buildReportCompareSummary(
  current: ReportPayload,
  baseline: ReportPayload,
  labels: {
    totalUrls: string;
    successRate: string;
    count4xx: string;
    count5xx: string;
    healthScore: string;
    auditIssues: string;
    securityFindings: string;
    avgPerformance: string;
    avgSeoScore: string;
  },
  extrasLabels: CompareExtrasLabels,
): ReportCompareSummary {
  const fingerprint = computeReportFingerprintDiff(current, baseline);
  const curSummary = current.summary ?? {};
  const baseSummary = baseline.summary ?? {};

  const curTotal = num(curSummary.total_urls) ?? (current.links?.length ?? 0);
  const baseTotal = num(baseSummary.total_urls) ?? (baseline.links?.length ?? 0);
  const cur2xx = num(curSummary.count_2xx) ?? 0;
  const base2xx = num(baseSummary.count_2xx) ?? 0;
  const cur4xx = num(curSummary.count_4xx) ?? 0;
  const base4xx = num(baseSummary.count_4xx) ?? 0;
  const cur5xx = num(curSummary.count_5xx) ?? 0;
  const base5xx = num(baseSummary.count_5xx) ?? 0;
  const curRate = num(curSummary.success_rate);
  const baseRate = num(baseSummary.success_rate);

  const metrics: CompareMetricRow[] = [
    deltaRow('total_urls', labels.totalUrls, curTotal, baseTotal, true),
    deltaRow('success_rate', labels.successRate, curRate, baseRate, true, 'percent'),
    deltaRow('count_4xx', labels.count4xx, cur4xx, base4xx, false),
    deltaRow('count_5xx', labels.count5xx, cur5xx, base5xx, false),
    deltaRow(
      'health_score',
      labels.healthScore,
      scoreFromCategories(current.categories ?? []),
      scoreFromCategories(baseline.categories ?? []),
      true,
      'score',
    ),
    deltaRow(
      'audit_issues',
      labels.auditIssues,
      countCategoryIssues(current.categories ?? []),
      countCategoryIssues(baseline.categories ?? []),
      false,
    ),
    deltaRow(
      'security',
      labels.securityFindings,
      current.security_findings?.length ?? 0,
      baseline.security_findings?.length ?? 0,
      false,
    ),
    deltaRow(
      'lh_perf',
      labels.avgPerformance,
      avgLighthouseScore(current.links, 'performance_score'),
      avgLighthouseScore(baseline.links, 'performance_score'),
      true,
      'score',
    ),
    deltaRow(
      'lh_seo',
      labels.avgSeoScore,
      avgLighthouseScore(current.links, 'seo_score'),
      avgLighthouseScore(baseline.links, 'seo_score'),
      true,
      'score',
    ),
  ];

  return {
    fingerprint: fingerprint ?? {
      newUrls: [],
      removedUrls: [],
      contentChanged: [],
      structureChanged: [],
    },
    urlChangeListsAvailable: fingerprint != null,
    metrics,
    categoryScores: buildCategoryScores(current, baseline),
    seoHealth: buildSeoHealthDeltas(current, baseline),
    statusChanges: buildLinkStatusChanges(current, baseline),
    urlMetadataChanges: buildUrlMetadataChanges(current, baseline),
    currentGeneratedAt: current.report_generated_at ?? null,
    baselineGeneratedAt: baseline.report_generated_at ?? null,
    extras: buildReportCompareExtras(current, baseline, extrasLabels),
  };
}
