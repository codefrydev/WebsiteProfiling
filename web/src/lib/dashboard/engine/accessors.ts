/**
 * Adapters that turn the awkward shapes inside ReportPayload into uniform
 * `Record<string, unknown>[]` row arrays the query engine can consume.
 */
import type {
  ReportCategory,
  LighthousePageSummary,
} from '@/types/report';
import { toNumber } from '@/lib/dashboard/engine/coerce';

/** Parallel arrays → [{label, value}]. e.g. `mime_labels` + `mime_values`. */
export function fromParallel(labels?: unknown[], values?: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(labels)) return [];
  return labels.map((l, i) => ({
    label: String(l ?? ''),
    value: toNumber(Array.isArray(values) ? values[i] : undefined) ?? 0,
  }));
}

/** `Record<string, number>` → [{label, value}]. e.g. `status_counts`, `depth_distribution.by_depth`. */
export function fromMap(map?: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([label, v]) => ({ label, value: toNumber(v) ?? 0 }));
}

/** Flatten `categories[].issues` into one row per issue, carrying category context. */
export function flattenCategoryIssues(cats?: ReportCategory[]): Record<string, unknown>[] {
  if (!Array.isArray(cats)) return [];
  return cats.flatMap((c) =>
    (c.issues ?? []).map((iss) => ({
      ...iss,
      category: c.name ?? c.id ?? '',
      category_score: c.score ?? null,
    })),
  );
}

/** `lighthouse_by_url: Record<url, summary>` → one flattened row per URL. */
export function flattenLighthouseByUrl(
  byUrl?: Record<string, LighthousePageSummary>,
): Record<string, unknown>[] {
  if (!byUrl || typeof byUrl !== 'object') return [];
  return Object.entries(byUrl).map(([url, s]) => {
    const cat = (s?.category_scores ?? {}) as Record<string, unknown>;
    const med = (s?.median_metrics ?? {}) as Record<string, unknown>;
    return {
      url,
      strategy: s?.strategy ?? s?.device ?? '',
      performance_score: toNumber(cat.performance),
      accessibility_score: toNumber(cat.accessibility),
      seo_score: toNumber(cat.seo),
      best_practices_score: toNumber(cat['best-practices']),
      lcp_ms: toNumber(med.lcp_ms),
      cls: toNumber(med.cls),
      tbt_ms: toNumber(med.tbt_ms),
      fcp_ms: toNumber(med.fcp_ms),
    };
  });
}

/** Prefix every key of a flat object: `flatPrefix('gsc', {clicks: 1})` → `{'gsc.clicks': 1}`. */
export function flatPrefix(prefix: string, obj?: Record<string, unknown> | null): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[`${prefix}.${k}`] = v;
  return out;
}
