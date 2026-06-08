import type { ReportLink } from '@/types';

export function parseLinkCustomFields(link: ReportLink): Record<string, string> {
  const raw = link.custom_fields;
  if (!raw) return {};
  if (typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '')]));
  }
  const text = String(raw).trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
    );
  } catch {
    return {};
  }
}

export function collectCustomFieldKeys(links: ReportLink[]): string[] {
  const keys = new Set<string>();
  for (const link of links) {
    Object.keys(parseLinkCustomFields(link)).forEach((k) => keys.add(k));
  }
  return [...keys].sort();
}
