'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import {
  PageLayout,
  PageHeader,
  Card,
  StatCard,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
} from '@/components';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import { fetchAuditTool } from '@/lib/fetchAuditTool';
import { strings } from '@/lib/strings';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import type { ViewProps } from '@/types';

export default function GeoReadiness({ searchQuery = '' }: ViewProps) {
  const vg = strings.views.geoReadiness;
  const { propertyId, reportId, contextReady } = useActivePropertyContext();

  const [geoScore, setGeoScore] = useState<Record<string, unknown> | null>(null);
  const [llms, setLlms] = useState<Record<string, unknown> | null>(null);
  const [aiDiscovery, setAiDiscovery] = useState<Record<string, unknown> | null>(null);
  const [robotsScore, setRobotsScore] = useState<Record<string, unknown> | null>(null);
  const [faq, setFaq] = useState<Record<string, unknown> | null>(null);
  const [eeat, setEeat] = useState<Record<string, unknown> | null>(null);
  const [citability, setCitability] = useState<Record<string, unknown> | null>(null);
  const [negativeSignals, setNegativeSignals] = useState<Record<string, unknown> | null>(null);
  const [missingFaq, setMissingFaq] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!contextReady) {
      setLoading(true);
      return;
    }
    if (!propertyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchAuditTool({ toolName: 'get_geo_readiness_score', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_llms_txt_status', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_ai_discovery_status', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_robots_ai_access_score', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_faq_schema_coverage', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_eeat_signals_summary', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_citability_score', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_negative_signals', propertyId, reportId, args: { limit: 50 } }),
      fetchAuditTool({
        toolName: 'list_pages_missing_faq_schema',
        propertyId,
        reportId,
        args: { limit: 200 },
      }),
    ])
      .then(([geo, llmsTxt, disc, robots, faqCov, eeatSum, cit, neg, faqList]) => {
        if (cancelled) return;
        setGeoScore(geo);
        setLlms(llmsTxt);
        setAiDiscovery(disc);
        setRobotsScore(robots);
        setFaq(faqCov);
        setEeat(eeatSum);
        setCitability(cit);
        setNegativeSignals(neg);
        const pages = Array.isArray(faqList.pages) ? faqList.pages : [];
        setMissingFaq(pages as Array<Record<string, unknown>>);
      })
      .catch(() => {
        if (!cancelled) setGeoScore(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contextReady, propertyId, reportId]);

  const q = (searchQuery || '').toLowerCase().trim();
  const filteredFaq = useMemo(() => {
    if (!q) return missingFaq;
    return missingFaq.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [missingFaq, q]);

  const pagination = useMemo(
    () => paginateSlice(filteredFaq, page, PAGE_SIZE),
    [filteredFaq, page],
  );

  useEffect(() => {
    setPage(1);
  }, [q]);

  const score = Number(geoScore?.geo_readiness_score) || 0;
  const band = String(geoScore?.band || '—');
  const categories = (geoScore?.categories || {}) as Record<string, { score: number; max: number }>;
  const components = (geoScore?.components || {}) as Record<string, number>;
  const citabilityScore = Number(citability?.citability_score) || 0;
  const negativePages = Array.isArray(negativeSignals?.pages) ? (negativeSignals?.pages as Array<Record<string, unknown>>) : [];
  const aiDiscoveryEndpoints = (aiDiscovery?.endpoints || {}) as Record<string, { found: boolean; url: string }>;
  const robotsPerBot = Array.isArray(robotsScore?.per_bot) ? (robotsScore?.per_bot as Array<Record<string, unknown>>) : [];

  return (
    <PageLayout>
      <PageHeader
        title={vg.title}
        subtitle={vg.subtitle}
        icon={<Globe2 className="h-7 w-7 text-link shrink-0" />}
      />

      <Card className="mb-4 border-violet-500/25 bg-violet-500/5 p-4">
        <p className="text-sm text-muted-foreground">{vg.provenanceBanner}</p>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{strings.app.loading}</Card>
      ) : (
        <>
          {/* Top stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label={vg.scoreLabel} value={score} />
            <StatCard label={vg.bandLabel} value={band} />
            <StatCard label={vg.citabilityLabel} value={citabilityScore} />
            <StatCard
              label={vg.llmsLabel}
              value={llms?.found ? vg.llmsFound : vg.llmsMissing}
            />
          </div>

          {/* 8-category score breakdown */}
          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{vg.componentsTitle}</h3>
              <ul className="space-y-2">
                {Object.entries(categories).map(([key, val]) => {
                  const pct = val.max ? Math.round((val.score / val.max) * 100) : 0;
                  return (
                    <li key={key} className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground flex-1">{key.replace(/_/g, ' ')}</span>
                      <span className="tabular-nums font-medium w-12 text-right">{val.score}/{val.max}</span>
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-link" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* llms.txt panel */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{vg.llmsPanelTitle}</h3>
              {llms?.found ? (
                <>
                  <p className="text-xs font-mono text-foreground break-all">{String(llms.url || '')}</p>
                  {llms.llms_full_txt_found && (
                    <p className="text-xs text-green-600 mt-1">llms-full.txt also found</p>
                  )}
                  {llms.depth ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {Object.entries(llms.depth as Record<string, unknown>).map(([k, v]) => (
                        <li key={k} className="flex justify-between">
                          <span>{k.replace(/_/g, ' ')}</span>
                          <span className="font-medium">{String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {llms.preview ? (
                    <pre className="mt-2 max-h-32 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                      {String(llms.preview)}
                    </pre>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{vg.llmsNotFoundHint}</p>
              )}
            </Card>
          </div>

          {/* AI discovery endpoints */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">{vg.aiDiscoveryTitle}</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(aiDiscoveryEndpoints).map(([key, ep]) => (
                <li key={key} className="flex items-center gap-2">
                  <span className={ep.found ? 'text-green-600' : 'text-destructive'}>
                    {ep.found ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground truncate">{key.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
            {aiDiscovery?.found_count !== undefined && (
              <p className="mt-2 text-xs text-muted-foreground">
                {String(aiDiscovery.found_count)} of {Object.keys(aiDiscoveryEndpoints).length} endpoints found
                · Score: {String(aiDiscovery.discovery_score ?? '—')}/6
              </p>
            )}
          </Card>

          {/* Robots AI-bot tier table */}
          {robotsPerBot.length > 0 && (
            <Card className="overflow-hidden mb-6">
              <h3 className="text-sm font-semibold text-foreground px-4 pt-4 pb-2">{vg.robotsTitle}</h3>
              <p className="px-4 pb-2 text-xs text-muted-foreground">
                Score: {String(robotsScore?.robots_score ?? '—')}/18
              </p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Bot</TableHeadCell>
                    <TableHeadCell>Tier</TableHeadCell>
                    <TableHeadCell>Access</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {robotsPerBot.slice(0, 12).map((bot) => (
                    <TableRow key={String(bot.agent)}>
                      <TableCell>
                        <span className="font-mono text-xs">{String(bot.agent)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{String(bot.tier)}</span>
                      </TableCell>
                      <TableCell>
                        <span className={
                          bot.access === 'blocked'
                            ? 'text-destructive text-xs font-medium'
                            : bot.access === 'allowed'
                              ? 'text-green-600 text-xs font-medium'
                              : 'text-muted-foreground text-xs'
                        }>
                          {String(bot.access)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Citability score */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-1">{vg.citabilityTitle}</h3>
            <p className="text-xs text-muted-foreground mb-3">{vg.citabilitySubtitle}</p>
            {citability ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Score</span>
                  <span className="ml-2 font-semibold">{citabilityScore}/100</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pages &gt; 50</span>
                  <span className="ml-2 font-semibold">{String(citability.pages_above_50 ?? '—')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pages &gt; 75</span>
                  <span className="ml-2 font-semibold">{String(citability.pages_above_75 ?? '—')}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </Card>

          {/* Negative signals */}
          {negativePages.length > 0 && (
            <Card className="overflow-hidden mb-6">
              <h3 className="text-sm font-semibold text-foreground px-4 pt-4 pb-2">{vg.negativeSectionTitle}</h3>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>URL</TableHeadCell>
                    <TableHeadCell>Signals</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {negativePages.slice(0, 10).map((row, i) => {
                    const url = String(row.url || '');
                    const sigs = Array.isArray(row.signals) ? row.signals : [];
                    return (
                      <TableRow key={`${url}-${i}`}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs break-all">{url}</span>
                            {url ? <UrlInspectorButton url={url} /> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(sigs as Array<Record<string, string>>).map((s, j) => (
                              <span key={j} className="text-xs bg-destructive/10 text-destructive rounded px-1 py-0.5">
                                {s.signal}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* E-E-A-T */}
          {eeat && !eeat.missing ? (
            <Card className="p-4 mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-2">{vg.eeatTitle}</h3>
              <ul className="grid grid-cols-3 gap-3 text-xs">
                <li>
                  <span className="text-muted-foreground">Author schema</span>
                  <span className="ml-2 font-medium">{String(eeat.pages_with_author_schema)}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">Org schema</span>
                  <span className="ml-2 font-medium">{String(eeat.pages_with_organization_schema)}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">About/Contact</span>
                  <span className="ml-2 font-medium">{String(eeat.about_contact_pages)}</span>
                </li>
              </ul>
            </Card>
          ) : null}

          {/* FAQ coverage stat */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label={vg.faqCoverageLabel} value={`${faq?.coverage_pct ?? '—'}%`} />
            <StatCard label={vg.faqPagesLabel} value={Number(faq?.pages_with_faq_schema) || 0} />
          </div>

          {/* Missing FAQ schema */}
          <Card className="overflow-hidden mb-6">
            <h3 className="text-sm font-semibold text-foreground px-4 pt-4 pb-2">{vg.missingFaqTitle}</h3>
            {filteredFaq.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">{vg.missingFaqEmpty}</p>
            ) : (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>{vg.colUrl}</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagination.slice.map((row, i) => {
                      const url = String(row.url || '');
                      return (
                        <TableRow key={`${url}-${i}`}>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs break-all">{url}</span>
                              {url ? <UrlInspectorButton url={url} /> : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="px-4 py-2 text-xs text-muted-foreground border-t border-default">
                  {vg.pageOf} {pagination.from}–{pagination.to} {vg.of} {filteredFaq.length}
                </p>
              </>
            )}
          </Card>

          {/* Live citation check note */}
          <Card className="p-4 border-violet-500/25 bg-violet-500/5">
            <h3 className="text-sm font-semibold text-foreground mb-1">{vg.citationLiveTitle}</h3>
            <p className="text-xs text-muted-foreground">{vg.citationLiveOptInNote}</p>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
