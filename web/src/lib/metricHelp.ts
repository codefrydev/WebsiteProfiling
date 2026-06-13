import { strings } from '@/lib/strings';

export type MetricHelpEntry = { title?: string; body: string };

type MetricHelpNode = MetricHelpEntry | { [key: string]: MetricHelpNode };

function isEntry(node: MetricHelpNode | undefined): node is MetricHelpEntry {
  return node != null && typeof node === 'object' && 'body' in node && typeof node.body === 'string';
}

/** Lookup metric help by dot path, e.g. `shared.clicks` or `views.overview.linkScore`. */
export function getMetricHelp(key: string): MetricHelpEntry | undefined {
  const parts = key.split('.').filter(Boolean);
  let node: MetricHelpNode | undefined = (strings as { metricHelp?: MetricHelpNode }).metricHelp;
  for (const part of parts) {
    if (node == null || typeof node !== 'object' || isEntry(node)) return undefined;
    node = node[part];
  }
  return isEntry(node) ? node : undefined;
}

/** Shorthand: returns body only, or undefined. */
export function getMetricHelpBody(key: string): string | undefined {
  return getMetricHelp(key)?.body;
}

/** For StatCard / table headers: string or structured hint. */
export function metricHelpHint(key: string): string | MetricHelpEntry | undefined {
  const entry = getMetricHelp(key);
  if (!entry) return undefined;
  if (entry.title) return entry;
  return entry.body;
}
