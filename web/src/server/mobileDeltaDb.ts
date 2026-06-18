import { withDb } from '@/server/db';

export interface MobileDesktopVariant {
  title: string;
  h1: string;
  word_count: number;
  status: number;
}

export interface MobileDesktopDeltaRow {
  url: string;
  desktop: MobileDesktopVariant;
  mobile: MobileDesktopVariant;
  title_differs: boolean;
  h1_differs: boolean;
  word_count_delta: number;
  status_differs: boolean;
}

export async function getMobileDesktopDelta(runId: number): Promise<MobileDesktopDeltaRow[]> {
  return withDb(async (client) => {
    // Check if paired mobile run exists
    const { rows: linkRows } = await client.query<{ mobile_run_id: number | null }>(
      'SELECT mobile_run_id FROM crawl_runs WHERE id = $1',
      [runId],
    );
    if (!linkRows.length || linkRows[0].mobile_run_id == null) return [];
    const mobileRunId = linkRows[0].mobile_run_id;

    const fetchRun = async (rid: number) => {
      const { rows } = await client.query<{ url: string; data: unknown }>(
        'SELECT url, data FROM crawl_results WHERE crawl_run_id = $1',
        [rid],
      );
      const map = new Map<string, MobileDesktopVariant>();
      for (const row of rows) {
        const d = (row.data ?? {}) as Record<string, unknown>;
        const key = String(row.url || '').replace(/\/$/, '').toLowerCase();
        map.set(key, {
          title: String(d['title'] ?? ''),
          h1: String(d['h1'] ?? ''),
          word_count: Number(d['word_count'] ?? 0) || 0,
          status: Number(d['status'] ?? 0) || 0,
        });
      }
      return map;
    };

    const [desktopMap, mobileMap] = await Promise.all([fetchRun(runId), fetchRun(mobileRunId)]);

    const deltas: MobileDesktopDeltaRow[] = [];
    for (const [key, desktop] of desktopMap) {
      const mobile = mobileMap.get(key);
      if (!mobile) continue;
      const title_differs = desktop.title !== mobile.title;
      const h1_differs = desktop.h1 !== mobile.h1;
      const word_count_delta = Math.abs(desktop.word_count - mobile.word_count);
      const status_differs = desktop.status !== mobile.status;
      if (!title_differs && !h1_differs && word_count_delta <= 50 && !status_differs) continue;
      const url = [...desktopMap.keys()].find((k) => k === key) ?? key;
      deltas.push({ url, desktop, mobile, title_differs, h1_differs, word_count_delta, status_differs });
    }

    deltas.sort(
      (a, b) =>
        (b.status_differs ? 4 : 0) +
        (b.title_differs ? 2 : 0) +
        (b.h1_differs ? 1 : 0) -
        ((a.status_differs ? 4 : 0) + (a.title_differs ? 2 : 0) + (a.h1_differs ? 1 : 0)),
    );
    return deltas;
  });
}
