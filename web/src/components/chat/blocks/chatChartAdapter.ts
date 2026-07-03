
import type { QueryResult } from '@/lib/dashboard/engine/types';

export function toQueryResult(
  title: string,
  items: { label: string; value: number }[],
): QueryResult {
  return {
    categories: items.map((i) => i.label),
    series: [{ key: title, label: title, values: items.map((i) => i.value) }],
    table: items.map((i) => ({ label: i.label, value: i.value })),
    scalar: items[0]?.value ?? null,
  };
}
