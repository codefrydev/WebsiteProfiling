import type { GoogleReportData } from '@/types/report';

const STALE_DAYS = 7;

export function googleSnapshotStatus(google: GoogleReportData | null | undefined): {
  stale: boolean;
  partial: boolean;
  fetchedAt: string | null;
  label: string | null;
} {
  if (!google || typeof google !== 'object') {
    return { stale: true, partial: true, fetchedAt: null, label: null };
  }
  const fetchedAt = String(google.fetched_at || '').trim() || null;
  let stale = false;
  if (fetchedAt) {
    const t = new Date(fetchedAt).getTime();
    if (Number.isFinite(t)) {
      const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
      stale = ageDays > STALE_DAYS;
    }
  } else {
    stale = true;
  }
  const hasGsc = Boolean(google.gsc || google.gsc_summary);
  const hasGa4 = Boolean(google.ga4 || google.ga4_summary);
  const partial = !hasGsc || !hasGa4;
  const label = fetchedAt
    ? `Search Console & Analytics · ${fetchedAt.slice(0, 10)}${stale ? ' (stale)' : ''}`
    : null;
  return { stale, partial, fetchedAt, label };
}
