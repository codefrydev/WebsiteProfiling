import type {
  ContentDuplicateCluster,
  ReportLink,
  ReportPayload,
  ReportRedirect,
  SecurityFinding,
  TechStackEntry,
} from '@/types/report';
import type { CompareMetricRow } from './reportCompare';
import { normReportUrl } from './reportDiff';

export interface IssueDeltaRow {
  kind: 'new' | 'resolved';
  url: string;
  category: string;
  priority: string;
  message: string;
}

export interface PriorityCountRow {
  priority: string;
  current: number;
  baseline: number;
  delta: number;
}

export interface LighthouseUrlRow {
  url: string;
  performanceDelta: number | null;
  seoDelta: number | null;
  performanceCurrent: number | null;
  performanceBaseline: number | null;
  seoCurrent: number | null;
  seoBaseline: number | null;
}

export interface LinkMetricRow {
  url: string;
  metric: string;
  label: string;
  current: number;
  baseline: number;
  delta: number;
  higherIsBetter: boolean;
}

export interface RedirectDeltaRow {
  kind: 'new' | 'removed';
  url: string;
  status: string;
  finalUrl: string;
}

export interface SecurityDeltaRow {
  kind: 'new' | 'resolved';
  url: string;
  severity: string;
  findingType: string;
  message: string;
}

export interface DuplicateDeltaRow {
  kind: 'new' | 'removed' | 'changed';
  clusterId: string;
  representativeUrl: string;
  currentMembers: number;
  baselineMembers: number;
}

export interface TechDeltaRow {
  kind: 'added' | 'removed';
  name: string;
  currentCount: number;
  baselineCount: number;
}

export interface ReportCompareExtras {
  issueDeltas: IssueDeltaRow[];
  priorityCounts: PriorityCountRow[];
  lighthouseUrls: LighthouseUrlRow[];
  linkMetrics: LinkMetricRow[];
  redirectDeltas: RedirectDeltaRow[];
  securityDeltas: SecurityDeltaRow[];
  duplicateDeltas: DuplicateDeltaRow[];
  techDeltas: TechDeltaRow[];
  contentMetrics: CompareMetricRow[];
  googleMetrics: CompareMetricRow[];
  googleAvailable: boolean;
}

function issueKey(url: string, category: string, message: string): string {
  return `${normReportUrl(url)}|${category}|${message.slice(0, 120)}`;
}

function flattenCategoryIssues(payload: ReportPayload): Map<string, IssueDeltaRow & { kind: 'new' }> {
  const map = new Map<string, IssueDeltaRow & { kind: 'new' }>();
  for (const cat of payload.categories ?? []) {
    const category = String(cat.name || cat.id || '');
    for (const iss of cat.issues ?? []) {
      const url = String(iss.url || '');
      const message = String(iss.message || iss.recommendation || '').trim();
      if (!url && !message) continue;
      const key = issueKey(url, category, message);
      map.set(key, {
        kind: 'new',
        url: url || '—',
        category,
        priority: String(iss.priority || 'Medium'),
        message: message || '—',
      });
    }
  }
  return map;
}

export function buildIssueDeltas(current: ReportPayload, baseline: ReportPayload): IssueDeltaRow[] {
  const cur = flattenCategoryIssues(current);
  const base = flattenCategoryIssues(baseline);
  const out: IssueDeltaRow[] = [];
  for (const [key, row] of cur) {
    if (!base.has(key)) out.push({ ...row, kind: 'new' });
  }
  for (const [key, row] of base) {
    if (!cur.has(key)) out.push({ ...row, kind: 'resolved' });
  }
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  out.sort((a, b) => {
    const pk = (order[a.priority as keyof typeof order] ?? 9) - (order[b.priority as keyof typeof order] ?? 9);
    if (pk !== 0) return pk;
    if (a.kind !== b.kind) return a.kind === 'new' ? -1 : 1;
    return a.url.localeCompare(b.url);
  });
  return out;
}

function countIssuesByPriority(payload: ReportPayload): Map<string, number> {
  const m = new Map<string, number>();
  for (const cat of payload.categories ?? []) {
    for (const iss of cat.issues ?? []) {
      const p = String(iss.priority || 'Medium');
      m.set(p, (m.get(p) ?? 0) + 1);
    }
  }
  return m;
}

export function buildPriorityCounts(current: ReportPayload, baseline: ReportPayload): PriorityCountRow[] {
  const priorities = ['Critical', 'High', 'Medium', 'Low'];
  const cur = countIssuesByPriority(current);
  const base = countIssuesByPriority(baseline);
  return priorities.map((priority) => {
    const c = cur.get(priority) ?? 0;
    const b = base.get(priority) ?? 0;
    return { priority, current: c, baseline: b, delta: c - b };
  });
}

function lhScore(link: ReportLink | undefined, key: 'performance_score' | 'seo_score'): number | null {
  const v = link?.lighthouse?.median_metrics?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}

function lhFromPayload(payload: ReportPayload): Map<string, { perf: number | null; seo: number | null }> {
  const map = new Map<string, { perf: number | null; seo: number | null }>();
  const byUrl = payload.lighthouse_by_url;
  if (byUrl && typeof byUrl === 'object') {
    for (const [rawUrl, summary] of Object.entries(byUrl)) {
      const k = normReportUrl(rawUrl);
      if (!k) continue;
      const m = summary?.median_metrics ?? {};
      const perf = typeof m.performance_score === 'number' ? Math.round(m.performance_score) : null;
      const seo = typeof m.seo_score === 'number' ? Math.round(m.seo_score) : null;
      map.set(k, { perf, seo });
    }
  }
  for (const l of payload.links ?? []) {
    const k = normReportUrl(l.url);
    if (!k || map.has(k)) continue;
    map.set(k, { perf: lhScore(l, 'performance_score'), seo: lhScore(l, 'seo_score') });
  }
  return map;
}

const LH_DELTA_THRESHOLD = 5;

export function buildLighthouseUrlDeltas(current: ReportPayload, baseline: ReportPayload): LighthouseUrlRow[] {
  const cur = lhFromPayload(current);
  const base = lhFromPayload(baseline);
  const out: LighthouseUrlRow[] = [];
  for (const [k, c] of cur) {
    const b = base.get(k);
    if (!b) continue;
    const perfDelta =
      c.perf != null && b.perf != null ? c.perf - b.perf : null;
    const seoDelta = c.seo != null && b.seo != null ? c.seo - b.seo : null;
    if (
      (perfDelta != null && Math.abs(perfDelta) >= LH_DELTA_THRESHOLD) ||
      (seoDelta != null && Math.abs(seoDelta) >= LH_DELTA_THRESHOLD)
    ) {
      out.push({
        url: k,
        performanceCurrent: c.perf,
        performanceBaseline: b.perf,
        performanceDelta: perfDelta,
        seoCurrent: c.seo,
        seoBaseline: b.seo,
        seoDelta,
      });
    }
  }
  out.sort((a, b) => Math.abs(b.performanceDelta ?? 0) - Math.abs(a.performanceDelta ?? 0));
  return out;
}

export function buildLinkMetricDeltas(
  current: ReportPayload,
  baseline: ReportPayload,
  labels: { inlinks: string; outlinks: string; wordCount: string; responseMs: string },
): LinkMetricRow[] {
  const specs: {
    key: keyof ReportLink;
    metric: string;
    label: string;
    minDelta: number;
    higherIsBetter: boolean;
  }[] = [
    { key: 'inlinks', metric: 'inlinks', label: labels.inlinks, minDelta: 1, higherIsBetter: true },
    { key: 'outlinks', metric: 'outlinks', label: labels.outlinks, minDelta: 1, higherIsBetter: true },
    { key: 'word_count', metric: 'word_count', label: labels.wordCount, minDelta: 25, higherIsBetter: true },
    { key: 'response_time_ms', metric: 'response_ms', label: labels.responseMs, minDelta: 150, higherIsBetter: false },
  ];
  const curMap = new Map<string, ReportLink>();
  for (const l of current.links ?? []) {
    const k = normReportUrl(l.url);
    if (k) curMap.set(k, l);
  }
  const out: LinkMetricRow[] = [];
  for (const bl of baseline.links ?? []) {
    const k = normReportUrl(bl.url);
    if (!k) continue;
    const cl = curMap.get(k);
    if (!cl) continue;
    for (const spec of specs) {
      const c = Number(cl[spec.key]);
      const b = Number(bl[spec.key]);
      if (!Number.isFinite(c) || !Number.isFinite(b)) continue;
      const delta = Math.round((c - b) * 10) / 10;
      if (Math.abs(delta) >= spec.minDelta) {
        out.push({
          url: cl.url || bl.url,
          metric: spec.metric,
          label: spec.label,
          current: c,
          baseline: b,
          delta,
          higherIsBetter: spec.higherIsBetter,
        });
      }
    }
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out.slice(0, 200);
}

function redirectKey(r: ReportRedirect): string {
  return normReportUrl(String(r.url || r.from || ''));
}

export function buildRedirectDeltas(current: ReportPayload, baseline: ReportPayload): RedirectDeltaRow[] {
  const toMap = (list: ReportRedirect[]) => {
    const m = new Map<string, RedirectDeltaRow>();
    for (const r of list) {
      const k = redirectKey(r);
      if (!k) continue;
      m.set(k, {
        kind: 'new',
        url: String(r.url || r.from || k),
        status: String(r.status ?? '—'),
        finalUrl: String(r.final_url || r.to || ''),
      });
    }
    return m;
  };
  const cur = toMap(current.redirects ?? []);
  const base = toMap(baseline.redirects ?? []);
  const out: RedirectDeltaRow[] = [];
  for (const [k, row] of cur) {
    if (!base.has(k)) out.push({ ...row, kind: 'new' });
  }
  for (const [k, row] of base) {
    if (!cur.has(k)) out.push({ ...row, kind: 'removed' });
  }
  return out.sort((a, b) => a.url.localeCompare(b.url));
}

function securityKey(f: SecurityFinding): string {
  return `${normReportUrl(f.url)}|${f.finding_type}|${(f.message || '').slice(0, 80)}`;
}

export function buildSecurityDeltas(current: ReportPayload, baseline: ReportPayload): SecurityDeltaRow[] {
  const toMap = (list: SecurityFinding[]) => {
    const m = new Map<string, SecurityDeltaRow>();
    for (const f of list) {
      const k = securityKey(f);
      m.set(k, {
        kind: 'new',
        url: String(f.url || '—'),
        severity: String(f.severity || '—'),
        findingType: String(f.finding_type || '—'),
        message: String(f.message || '—'),
      });
    }
    return m;
  };
  const cur = toMap(current.security_findings ?? []);
  const base = toMap(baseline.security_findings ?? []);
  const out: SecurityDeltaRow[] = [];
  for (const [key, row] of cur) {
    if (!base.has(key)) out.push({ ...row, kind: 'new' });
  }
  for (const [key, row] of base) {
    if (!cur.has(key)) out.push({ ...row, kind: 'resolved' });
  }
  return out;
}

function dupKey(c: ContentDuplicateCluster): string {
  return String(c.id || c.representative_url || '').trim();
}

export function buildDuplicateDeltas(current: ReportPayload, baseline: ReportPayload): DuplicateDeltaRow[] {
  const toMap = (list: ContentDuplicateCluster[]) => {
    const m = new Map<string, { rep: string; members: number }>();
    for (const c of list) {
      const k = dupKey(c);
      if (!k) continue;
      m.set(k, {
        rep: c.representative_url || k,
        members: c.member_count ?? c.member_urls?.length ?? 0,
      });
    }
    return m;
  };
  const cur = toMap(current.content_duplicates ?? []);
  const base = toMap(baseline.content_duplicates ?? []);
  const out: DuplicateDeltaRow[] = [];
  for (const [id, c] of cur) {
    const b = base.get(id);
    if (!b) {
      out.push({
        kind: 'new',
        clusterId: id,
        representativeUrl: c.rep,
        currentMembers: c.members,
        baselineMembers: 0,
      });
    } else if (c.members !== b.members) {
      out.push({
        kind: 'changed',
        clusterId: id,
        representativeUrl: c.rep,
        currentMembers: c.members,
        baselineMembers: b.members,
      });
    }
  }
  for (const [id, b] of base) {
    if (!cur.has(id)) {
      out.push({
        kind: 'removed',
        clusterId: id,
        representativeUrl: b.rep,
        currentMembers: 0,
        baselineMembers: b.members,
      });
    }
  }
  return out;
}

function techName(t: TechStackEntry): string {
  return String(t.name || t.tech || '').trim();
}

export function buildTechDeltas(current: ReportPayload, baseline: ReportPayload): TechDeltaRow[] {
  const toMap = (entries: TechStackEntry[]) => {
    const m = new Map<string, number>();
    for (const t of entries) {
      const n = techName(t);
      if (!n) continue;
      m.set(n, Number(t.count) || 0);
    }
    return m;
  };
  const cur = toMap(current.tech_stack_summary?.technologies ?? []);
  const base = toMap(baseline.tech_stack_summary?.technologies ?? []);
  const out: TechDeltaRow[] = [];
  for (const [name, count] of cur) {
    if (!base.has(name)) out.push({ kind: 'added', name, currentCount: count, baselineCount: 0 });
  }
  for (const [name, count] of base) {
    if (!cur.has(name)) out.push({ kind: 'removed', name, currentCount: 0, baselineCount: count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function metricRow(
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

export function buildContentMetrics(
  current: ReportPayload,
  baseline: ReportPayload,
  labels: Record<string, string>,
): CompareMetricRow[] {
  const cw = current.content_analytics?.word_count_stats ?? {};
  const bw = baseline.content_analytics?.word_count_stats ?? {};
  const curThin =
    current.content_analytics?.thin_pages?.length ??
    Number(current.seo_health?.thin_content ?? 0);
  const baseThin =
    baseline.content_analytics?.thin_pages?.length ??
    Number(baseline.seo_health?.thin_content ?? 0);
  const curDup = current.content_duplicates?.length ?? 0;
  const baseDup = baseline.content_duplicates?.length ?? 0;
  const cs = current.social_coverage ?? {};
  const bs = baseline.social_coverage ?? {};

  return [
    metricRow('mean_words', labels.meanWords, num(cw.mean), num(bw.mean), true),
    metricRow('median_words', labels.medianWords, num(cw.median), num(bw.median), true),
    metricRow('thin_pages', labels.thinPages, curThin, baseThin, false),
    metricRow('dup_groups', labels.duplicateGroups, curDup, baseDup, false),
    metricRow('og_cov', labels.ogCoverage, num(cs.og_coverage_pct), num(bs.og_coverage_pct), true, 'percent'),
    metricRow(
      'tw_cov',
      labels.twitterCoverage,
      num(cs.twitter_coverage_pct),
      num(bs.twitter_coverage_pct),
      true,
      'percent',
    ),
    metricRow('resp_p50', labels.responseP50, num(current.response_time_stats?.p50), num(baseline.response_time_stats?.p50), false),
    metricRow('resp_p95', labels.responseP95, num(current.response_time_stats?.p95), num(baseline.response_time_stats?.p95), false),
    metricRow(
      'crawl_time',
      labels.crawlDuration,
      num(current.summary?.crawl_time_s),
      num(baseline.summary?.crawl_time_s),
      false,
    ),
    metricRow(
      'count_3xx',
      labels.redirectPages,
      num(current.summary?.count_3xx),
      num(baseline.summary?.count_3xx),
      false,
    ),
    metricRow(
      'avg_outlinks',
      labels.avgOutlinks,
      num(current.summary?.avg_outlinks),
      num(baseline.summary?.avg_outlinks),
      true,
    ),
  ].filter((r) => r.current != null || r.baseline != null);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildGoogleMetrics(
  current: ReportPayload,
  baseline: ReportPayload,
  labels: Record<string, string>,
): { available: boolean; metrics: CompareMetricRow[] } {
  const cg = current.google?.gsc?.summary;
  const bg = baseline.google?.gsc?.summary;
  const ca = current.google?.ga4?.summary;
  const ba = baseline.google?.ga4?.summary;
  const hasGsc = cg != null || bg != null;
  const hasGa4 = ca != null || ba != null;
  if (!hasGsc && !hasGa4) return { available: false, metrics: [] };

  const rows: CompareMetricRow[] = [];
  if (hasGsc) {
    rows.push(
      metricRow('gsc_clicks', labels.gscClicks, num(cg?.clicks), num(bg?.clicks), true),
      metricRow('gsc_impr', labels.gscImpressions, num(cg?.impressions), num(bg?.impressions), true),
      metricRow('gsc_ctr', labels.gscCtr, num(cg?.ctr), num(bg?.ctr), true, 'percent'),
      metricRow('gsc_pos', labels.gscPosition, num(cg?.position), num(bg?.position), false),
    );
  }
  if (hasGa4) {
    rows.push(
      metricRow('ga4_sessions', labels.ga4Sessions, num(ca?.sessions), num(ba?.sessions), true),
      metricRow('ga4_users', labels.ga4Users, num(ca?.activeUsers), num(ba?.activeUsers), true),
      metricRow('ga4_views', labels.ga4PageViews, num(ca?.screenPageViews), num(ba?.screenPageViews), true),
      metricRow(
        'ga4_engagement',
        labels.ga4Engagement,
        num(ca?.engagementRate),
        num(ba?.engagementRate),
        true,
        'percent',
      ),
    );
  }
  return {
    available: true,
    metrics: rows.filter((r) => r.current != null || r.baseline != null),
  };
}

export interface CompareExtrasLabels {
  linkMetrics: { inlinks: string; outlinks: string; wordCount: string; responseMs: string };
  content: Record<string, string>;
  google: Record<string, string>;
}

export function buildReportCompareExtras(
  current: ReportPayload,
  baseline: ReportPayload,
  labels: CompareExtrasLabels,
): ReportCompareExtras {
  const issueDeltas = buildIssueDeltas(current, baseline);
  const google = buildGoogleMetrics(current, baseline, labels.google);
  return {
    issueDeltas,
    priorityCounts: buildPriorityCounts(current, baseline),
    lighthouseUrls: buildLighthouseUrlDeltas(current, baseline),
    linkMetrics: buildLinkMetricDeltas(current, baseline, labels.linkMetrics),
    redirectDeltas: buildRedirectDeltas(current, baseline),
    securityDeltas: buildSecurityDeltas(current, baseline),
    duplicateDeltas: buildDuplicateDeltas(current, baseline),
    techDeltas: buildTechDeltas(current, baseline),
    contentMetrics: buildContentMetrics(current, baseline, labels.content),
    googleMetrics: google.metrics,
    googleAvailable: google.available,
  };
}
