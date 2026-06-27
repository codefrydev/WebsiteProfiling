
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch, readApiErrorMessage } from '@/lib/publicBase';
import { Loader2, RefreshCw, Sparkles, Radio } from 'lucide-react';
import type { LinkDetail } from '@/types/report';
import type { CompareMetricRow } from '@/lib/reportCompare';
import type { PageGa4Slice, PageGscSlice } from '@/lib/pageGoogleData';
import { buildPageTrafficHints } from '@/lib/pageTrafficHints';
import { strings, format } from '../../../lib/strings';
import { useOptionalPipeline } from '@/context/PipelineContext';
import { CompareMetricCard } from '../../compare/CompareDeltaBadge';
import CopyBtn from '../CopyBtn';

const sr = strings.components.linkTabs.searchRetention;
const sj = strings.common;

type SnapType = 'snapshot' | 'live';

interface HistoryRow {
  id: number;
  fetchedAt: string | null;
  type: SnapType;
  gsc?: { clicks?: number; impressions?: number; position?: number } | null;
  ga4?: { sessions?: number; engagementRate?: number } | null;
}

interface PageDataResponse {
  source: 'snapshot' | 'live';
  snapshotId: number | null;
  gsc: PageGscSlice | null;
  ga4: PageGa4Slice | null;
  coverage?: { inCrawl?: boolean; inGsc?: boolean; inGa4?: boolean };
  siteBenchmarks?: {
    gsc?: { ctr?: number; position?: number };
    ga4?: { engagementRate?: number };
  };
  dateRange?: { start?: string; end?: string };
  fetchedAt?: string | null;
}

interface CompareResponse {
  current: { type: SnapType; id: number; fetchedAt: string | null; gsc: PageGscSlice | null; ga4: PageGa4Slice | null };
  baseline: CompareResponse['current'] | null;
  metrics: CompareMetricRow[];
}

type CompareSelect =
  | 'default'
  | { baselineType: SnapType; baselineId: number };

interface CoachPayload {
  summary?: string;
  missing_on_page?: string[];
  retention_improvements?: Array<{ title?: string; why?: string; priority?: string }>;
  seo_improvements?: Array<{ title?: string; why?: string; priority?: string }>;
  quick_wins?: string[];
}

export interface SearchRetentionTabProps {
  link: LinkDetail;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return sj.emDash;
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function compareLabel(row: HistoryRow): string {
  const when = fmtWhen(row.fetchedAt);
  if (row.type === 'live') return format(sr.compareLiveOption, { when });
  return format(sr.compareSiteOption, { when });
}

export default function SearchRetentionTab({ link }: SearchRetentionTabProps) {
  const pageUrl = link.url || '';
  const pipeline = useOptionalPipeline();
  const propertyId = Number(pipeline?.configState.active_property_id || 0);

  const pageGoogleQuery = useMemo(() => {
    const q = new URLSearchParams({ url: pageUrl });
    if (propertyId > 0) q.set('propertyId', String(propertyId));
    return q;
  }, [pageUrl, propertyId]);

  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<PageDataResponse | null>(null);
  const [siteHistory, setSiteHistory] = useState<HistoryRow[]>([]);
  const [liveHistory, setLiveHistory] = useState<HistoryRow[]>([]);

  const [currentType, setCurrentType] = useState<SnapType>('snapshot');
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [compareSelect, setCompareSelect] = useState<CompareSelect>('default');
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachPayload | null>(null);
  const [coachCached, setCoachCached] = useState(false);

  const loadSnapshot = useCallback(async (googleSnapshotId?: number | null) => {
    const q = new URLSearchParams(pageGoogleQuery);
    if (googleSnapshotId != null) q.set('googleSnapshotId', String(googleSnapshotId));
    const res = await apiFetch(apiUrl(`/integrations/google/page-data?${q}`));
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(readApiErrorMessage(body, res));
    return body as unknown as PageDataResponse;
  }, [pageGoogleQuery]);

  const loadHistories = useCallback(async () => {
    const [siteRes, liveRes] = await Promise.all([
      apiFetch(apiUrl(`/integrations/google/page-data/history?${pageGoogleQuery}`)),
      apiFetch(apiUrl(`/integrations/google/page-live/history?url=${encodeURIComponent(pageUrl)}`)),
    ]);
    const site = siteRes.ok ? ((await siteRes.json()) as { history?: HistoryRow[] }).history || [] : [];
    const live = liveRes.ok ? ((await liveRes.json()) as { history?: HistoryRow[] }).history || [] : [];
    setSiteHistory(site);
    setLiveHistory(live);
    return { site, live };
  }, [pageGoogleQuery, pageUrl]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadSnapshot(
        currentType === 'snapshot' && currentId != null ? currentId : null,
      );
      setPageData(data);
      if (currentType === 'snapshot' && currentId == null && data.snapshotId != null) {
        setCurrentId(data.snapshotId);
      }
      await loadHistories();
    } catch (e) {
      setPageData(null);
      setLiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadSnapshot, loadHistories, currentType, currentId]);

  useEffect(() => {
    void refreshAll();
  }, [pageUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on URL change only

  const loadCompare = useCallback(async () => {
    if (!pageUrl) return;
    setCompareLoading(true);
    try {
      const q = new URLSearchParams({ url: pageUrl });
      if (currentType && currentId != null) {
        q.set('currentType', currentType);
        q.set('currentId', String(currentId));
      }
      if (compareSelect !== 'default') {
        q.set('baselineType', compareSelect.baselineType);
        q.set('baselineId', String(compareSelect.baselineId));
      }
      const res = await apiFetch(apiUrl(`/integrations/google/page-compare?${q}`));
      if (!res.ok) {
        setCompare(null);
        return;
      }
      const data = (await res.json()) as CompareResponse;
      setCompare(data);
      if (data.current?.id) {
        setCurrentType(data.current.type);
        setCurrentId(data.current.id);
      }
    } finally {
      setCompareLoading(false);
    }
  }, [pageUrl, currentType, currentId, compareSelect]);

  useEffect(() => {
    if (!loading && pageUrl) void loadCompare();
  }, [loading, pageUrl, currentType, currentId, compareSelect, loadCompare]);

  const displayGsc = compare?.current?.gsc ?? pageData?.gsc ?? null;
  const displayGa4 = compare?.current?.ga4 ?? pageData?.ga4 ?? null;
  const dataSource: 'snapshot' | 'live' = compare?.current?.type ?? currentType;

  const hints = useMemo(
    () =>
      buildPageTrafficHints({
        link,
        gsc: displayGsc,
        ga4: displayGa4,
        coverage: pageData?.coverage,
        siteBenchmarks: pageData?.siteBenchmarks,
        compare: compare?.metrics,
        dataSource,
      }),
    [link, displayGsc, displayGa4, pageData, compare?.metrics, dataSource],
  );

  const handleFetchLive = async () => {
    setLiveBusy(true);
    setLiveError(null);
    try {
      const res = await apiFetch(apiUrl('/integrations/google/page-live'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pageUrl }),
      });
      const data = (await res.json()) as Record<string, unknown> & {
        ok?: boolean;
        snapshotId?: number;
        gsc?: PageGscSlice | null;
        ga4?: PageGa4Slice | null;
        fetchedAt?: string | null;
        dateRange?: PageDataResponse['dateRange'];
      };
      if (!res.ok || !data.ok) {
        throw new Error(readApiErrorMessage(data, res, sr.liveFetchFailed));
      }
      setCurrentType('live');
      setCurrentId(data.snapshotId ?? null);
      setPageData({
        source: 'live',
        snapshotId: data.snapshotId ?? null,
        gsc: data.gsc ?? null,
        ga4: data.ga4 ?? null,
        fetchedAt: data.fetchedAt ?? null,
        dateRange: data.dateRange,
        coverage: pageData?.coverage,
        siteBenchmarks: pageData?.siteBenchmarks,
      });
      await loadHistories();
      setCompareSelect('default');
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setLiveBusy(false);
    }
  };

  const handleRevertSnapshot = async () => {
    setCurrentType('snapshot');
    setCurrentId(null);
    setCompareSelect('default');
    const data = await loadSnapshot(null);
    setPageData(data);
    if (data.snapshotId != null) setCurrentId(data.snapshotId);
  };

  const handleViewSiteSnapshot = async (id: number) => {
    setCurrentType('snapshot');
    setCurrentId(id);
    const data = await loadSnapshot(id);
    setPageData(data);
    setCompareSelect('default');
  };

  const handleViewLiveSnapshot = (id: number) => {
    setCurrentType('live');
    setCurrentId(id);
    setCompareSelect('default');
  };

  const runCoach = async (refresh = false) => {
    setCoachBusy(true);
    setCoachError(null);
    try {
      const body: Record<string, unknown> = { url: pageUrl, refresh };
      if (currentType && currentId != null) {
        body.currentType = currentType;
        body.currentId = currentId;
      }
      if (compare?.baseline) {
        body.baselineType = compare.baseline.type;
        body.baselineId = compare.baseline.id;
      }
      const res = await apiFetch(apiUrl('/links/page-coach'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown> & {
        ok?: boolean;
        coach?: CoachPayload;
        cached?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(readApiErrorMessage(data, res, sr.coachFailed));
      }
      setCoach((data.coach || {}) as CoachPayload);
      setCoachCached(!!data.cached);
    } catch (e) {
      setCoachError(e instanceof Error ? e.message : String(e));
    } finally {
      setCoachBusy(false);
    }
  };

  const compareCaption =
    compare?.baseline && compare.current
      ? format(sr.compareCaption, {
          baselineType: compare.baseline.type === 'live' ? sr.badgeLive : sr.badgeSnapshot,
          when: fmtWhen(compare.baseline.fetchedAt),
        })
      : null;

  const hasGoogleData = !!(displayGsc || displayGa4);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        {sr.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Data bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-brand-900 border border-default rounded-xl">
        <span
          className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded ${
            dataSource === 'live'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
          }`}
        >
          {dataSource === 'live' ? sr.badgeLive : sr.badgeSnapshot}
        </span>
        {pageData?.fetchedAt && (
          <span className="text-xs text-muted-foreground">{format(sr.fetchedAt, { when: fmtWhen(pageData.fetchedAt) })}</span>
        )}
        <button
          type="button"
          disabled={liveBusy}
          onClick={() => void handleFetchLive()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
        >
          {liveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          {sr.fetchLive}
        </button>
        {dataSource === 'live' && (
          <button
            type="button"
            onClick={() => void handleRevertSnapshot()}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {sr.revertSnapshot}
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <label className="text-xs text-muted-foreground">{sr.compareTo}</label>
          <select
            className="text-sm bg-brand-800 border border-default rounded-lg px-2 py-1 max-w-[220px]"
            value={
              compareSelect === 'default'
                ? 'default'
                : `${compareSelect.baselineType}:${compareSelect.baselineId}`
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'default') setCompareSelect('default');
              else {
                const [baselineType, id] = v.split(':');
                setCompareSelect({
                  baselineType: baselineType as SnapType,
                  baselineId: parseInt(id, 10),
                });
              }
            }}
          >
            <option value="default">{sr.compareDefault}</option>
            {liveHistory.length > 1 &&
              liveHistory.slice(1).map((row) => (
                <option key={`live-${row.id}`} value={`live:${row.id}`}>
                  {compareLabel(row)}
                </option>
              ))}
            {siteHistory.map((row) => (
              <option key={`snap-${row.id}`} value={`snapshot:${row.id}`}>
                {compareLabel(row)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {liveError && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{liveError}</p>
      )}

      {!hasGoogleData && (
        <div className="p-6 border border-dashed border-default rounded-xl text-center text-muted-foreground text-sm space-y-2">
          <p>{sr.emptyNoData}</p>
          <p className="text-xs">{sr.emptyPrereq}</p>
        </div>
      )}

      {compareLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {sr.compareLoading}
        </div>
      )}

      {compare?.metrics && compare.metrics.length > 0 && compare.baseline && (
        <section>
          <h3 className="text-sm font-semibold text-bright mb-1">{sr.compareHeading}</h3>
          {compareCaption && <p className="text-xs text-muted-foreground mb-3">{compareCaption}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {compare.metrics.map((row) => (
              <CompareMetricCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}

      {hasGoogleData && (
        <>
          <section className="grid sm:grid-cols-2 gap-4">
            <div className="bg-brand-900 border border-default rounded-xl p-4">
              <h3 className="text-sm font-semibold text-bright mb-3">{sr.gscHeading}</h3>
              {displayGsc ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.clicks}</dt>
                    <dd className="font-semibold tabular-nums">{displayGsc.clicks?.toLocaleString() ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.impressions}</dt>
                    <dd className="font-semibold tabular-nums">{displayGsc.impressions?.toLocaleString() ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.ctr}</dt>
                    <dd className="font-semibold tabular-nums">{displayGsc.ctr ?? 0}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.position}</dt>
                    <dd className="font-semibold tabular-nums">{displayGsc.position?.toFixed(1) ?? sj.emDash}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">{sr.noGsc}</p>
              )}
            </div>
            <div className="bg-brand-900 border border-default rounded-xl p-4">
              <h3 className="text-sm font-semibold text-bright mb-3">{sr.ga4Heading}</h3>
              {displayGa4 ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.sessions}</dt>
                    <dd className="font-semibold tabular-nums">{displayGa4.sessions?.toLocaleString() ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.pageViews}</dt>
                    <dd className="font-semibold tabular-nums">{displayGa4.screenPageViews?.toLocaleString() ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.engagement}</dt>
                    <dd className="font-semibold tabular-nums">{displayGa4.engagementRate ?? 0}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{sr.avgDuration}</dt>
                    <dd className="font-semibold tabular-nums">
                      {displayGa4.avgSessionDuration != null
                        ? `${Math.round(displayGa4.avgSessionDuration)}s`
                        : sj.emDash}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">{sr.noGa4}</p>
              )}
            </div>
          </section>

          {displayGsc?.queries && displayGsc.queries.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-bright mb-2">{sr.topQueries}</h3>
              <div className="overflow-x-auto border border-default rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-default bg-brand-900/80">
                      <th className="px-3 py-2">{sr.queryCol}</th>
                      <th className="px-3 py-2 text-right">{sr.clicks}</th>
                      <th className="px-3 py-2 text-right">{sr.impressions}</th>
                      <th className="px-3 py-2 text-right">{sr.position}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayGsc.queries.slice(0, 15).map((q, i) => (
                      <tr key={`${q.query}-${i}`} className="border-b border-default/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{q.query || sj.emDash}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.clicks ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.impressions ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {q.position != null ? Number(q.position).toFixed(1) : sj.emDash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Quick wins */}
      <section>
        <h3 className="text-sm font-semibold text-bright mb-2">{sr.quickWinsHeading}</h3>
        {hints.length === 0 ? (
          <p className="text-sm text-muted-foreground">{sr.noHints}</p>
        ) : (
          <ul className="space-y-2">
            {hints.map((h, i) => (
              <li
                key={`${h.category}-${i}`}
                className="p-3 rounded-lg border border-default bg-brand-900/50 text-sm"
              >
                <span
                  className={`text-[10px] uppercase font-bold mr-2 ${
                    h.severity === 'high'
                      ? 'text-rose-600 dark:text-rose-400'
                      : h.severity === 'medium'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {h.severity}
                </span>
                <span className="text-bright">{h.message}</span>
                {h.action && <p className="text-xs text-muted-foreground mt-1">{h.action}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History pickers */}
      {(siteHistory.length > 0 || liveHistory.length > 0) && (
        <section className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">{sr.historyHeading}</p>
          {liveHistory.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => handleViewLiveSnapshot(row.id)}
            >
              {format(sr.historyLiveRow, { when: fmtWhen(row.fetchedAt), id: row.id })}
            </button>
          ))}
          {siteHistory.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => void handleViewSiteSnapshot(row.id)}
            >
              {format(sr.historySiteRow, { when: fmtWhen(row.fetchedAt), id: row.id })}
            </button>
          ))}
        </section>
      )}

      {/* AI coach */}
      <section className="border border-default rounded-xl p-4 bg-brand-900/40">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-bright flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            {sr.coachHeading}
          </h3>
          <button
            type="button"
            disabled={coachBusy || !hasGoogleData}
            onClick={() => void runCoach(false)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
          >
            {coachBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {sr.coachGenerate}
          </button>
          {coach && (
            <button
              type="button"
              disabled={coachBusy}
              onClick={() => void runCoach(true)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {sr.coachRegenerate}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">{sr.coachHint}</p>
        {coachError && <p className="text-sm text-rose-600 dark:text-rose-400 mb-2">{coachError}</p>}
        {coachCached && coach && (
          <p className="text-xs text-muted-foreground mb-2">{sr.coachCached}</p>
        )}
        {coach?.summary && (
          <div className="space-y-4 text-sm">
            <p className="text-foreground leading-relaxed">{coach.summary}</p>
            {coach.missing_on_page && coach.missing_on_page.length > 0 && (
              <div>
                <h4 className="font-medium text-bright mb-1">{sr.coachMissing}</h4>
                <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                  {coach.missing_on_page.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {coach.retention_improvements && coach.retention_improvements.length > 0 && (
              <CoachList title={sr.coachRetention} items={coach.retention_improvements} />
            )}
            {coach.seo_improvements && coach.seo_improvements.length > 0 && (
              <CoachList title={sr.coachSeo} items={coach.seo_improvements} />
            )}
            {coach.quick_wins && coach.quick_wins.length > 0 && (
              <div>
                <h4 className="font-medium text-bright mb-1">{sr.coachQuickWins}</h4>
                <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                  {coach.quick_wins.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {sr.coachCopyJson}
              <CopyBtn text={JSON.stringify(coach, null, 2)} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CoachList({
  title,
  items,
}: {
  title: string;
  items: Array<{ title?: string; why?: string; priority?: string }>;
}) {
  return (
    <div>
      <h4 className="font-medium text-bright mb-1">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="border-l-2 border-violet-500/50 pl-3">
            <span className="font-medium">{item.title}</span>
            {item.priority && (
              <span className="ml-2 text-[10px] uppercase text-muted-foreground">{item.priority}</span>
            )}
            {item.why && <p className="text-xs text-muted-foreground mt-0.5">{item.why}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
