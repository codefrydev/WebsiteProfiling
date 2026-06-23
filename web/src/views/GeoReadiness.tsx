
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type TabId = 'citation' | 'agent';

export default function GeoReadiness({ searchQuery = '' }: ViewProps) {
  const vg = strings.views.geoReadiness;
  const [activeTab, setActiveTab] = useState<TabId>('citation');
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

  // Agent tab state
  const [agentScore, setAgentScore] = useState<Record<string, unknown> | null>(null);
  const [agentsMd, setAgentsMd] = useState<Record<string, unknown> | null>(null);
  const [skillMd, setSkillMd] = useState<Record<string, unknown> | null>(null);
  const [agentPermissions, setAgentPermissions] = useState<Record<string, unknown> | null>(null);
  const [tokenBudget, setTokenBudget] = useState<Record<string, unknown> | null>(null);
  const [oversizedPages, setOversizedPages] = useState<Array<Record<string, unknown>>>([]);
  const [copyForAi, setCopyForAi] = useState<Record<string, unknown> | null>(null);
  const [agentBundle, setAgentBundle] = useState<Record<string, unknown> | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentFetched, setAgentFetched] = useState(false);
  const [bundleGenerating, setBundleGenerating] = useState(false);

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

  // Lazy-load agent tab data when the tab becomes active
  useEffect(() => {
    if (activeTab !== 'agent' || agentFetched || !contextReady || !propertyId) return;
    let cancelled = false;
    setAgentLoading(true);
    void Promise.all([
      fetchAuditTool({ toolName: 'get_agent_readiness_score', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_agents_md_status', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_skill_md_status', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_agent_permissions_status', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_token_budget_summary', propertyId, reportId }),
      fetchAuditTool({ toolName: 'list_oversized_pages_for_agents', propertyId, reportId, args: { limit: 50 } }),
      fetchAuditTool({ toolName: 'get_copy_for_ai_signals', propertyId, reportId }),
    ])
      .then(([score, agents, skill, perms, tokens, oversized, copy]) => {
        if (cancelled) return;
        setAgentScore(score);
        setAgentsMd(agents);
        setSkillMd(skill);
        setAgentPermissions(perms);
        setTokenBudget(tokens);
        setOversizedPages(Array.isArray(oversized?.pages) ? (oversized.pages as Array<Record<string, unknown>>) : []);
        setCopyForAi(copy);
        setAgentFetched(true);
      })
      .catch(() => { if (!cancelled) setAgentFetched(true); })
      .finally(() => { if (!cancelled) setAgentLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, agentFetched, contextReady, propertyId, reportId]);

  const handleGenerateBundle = useCallback(() => {
    if (!propertyId || bundleGenerating) return;
    setBundleGenerating(true);
    void fetchAuditTool({ toolName: 'generate_agent_readiness_bundle', propertyId, reportId })
      .then((result) => { setAgentBundle(result); })
      .finally(() => { setBundleGenerating(false); });
  }, [propertyId, reportId, bundleGenerating]);

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

  // Agent tab derived
  const agentPct = Number(agentScore?.percentage) || 0;
  const agentGrade = String(agentScore?.grade || '—');
  const agentCategories = (agentScore?.categories || {}) as Record<string, { score: number; max: number }>;
  const gradeColor = (g: string) =>
    g === 'A' ? 'text-green-600' : g === 'B' ? 'text-green-500' : g === 'C' ? 'text-yellow-600' : g === 'D' ? 'text-orange-500' : g === 'F' ? 'text-destructive' : 'text-muted-foreground';

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

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-default">
        {(['citation', 'agent'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-link text-link'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'citation' ? vg.tabCitation : vg.tabAgent}
          </button>
        ))}
      </div>

      {activeTab === 'citation' && (loading ? (
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
      ))}

      {activeTab === 'agent' && (agentLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{strings.app.loading}</Card>
      ) : (
        <>
          {/* Agent score header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label={vg.agentScoreLabel} value={agentPct} />
            <StatCard label={vg.agentGradeLabel} value={<span className={gradeColor(agentGrade)}>{agentGrade}</span>} />
            <StatCard label={vg.agentAgentsMdLabel} value={agentsMd?.found ? vg.agentAgentsMdFound : vg.agentAgentsMdMissing} />
            <StatCard label={vg.agentSkillMdLabel} value={skillMd?.found ? vg.agentAgentsMdFound : vg.agentAgentsMdMissing} />
          </div>

          {/* 5-category score breakdown */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">{vg.agentCategoriesTitle}</h3>
            <ul className="space-y-2">
              {Object.entries(agentCategories).map(([key, val]) => {
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

          {/* Discovery files */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">{vg.agentDiscoveryFilesTitle}</h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'AGENTS.md', data: agentsMd },
                { label: 'skill.md', data: skillMd },
                { label: 'agent-permissions.json', data: agentPermissions },
              ].map(({ label, data }) => (
                <li key={label} className="flex items-center gap-3">
                  <span className={data?.found ? 'text-green-600' : 'text-destructive'}>
                    {data?.found ? '✓' : '✗'}
                  </span>
                  <span className="font-mono text-xs flex-1">{label}</span>
                  {data?.found && data?.url ? (
                    <span className="text-xs text-muted-foreground truncate max-w-xs">{String(data.url)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          {/* Token budget */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-1">{vg.agentTokenBudgetTitle}</h3>
            <p className="text-xs text-muted-foreground mb-3">{vg.agentTokenBudgetSubtitle}</p>
            {tokenBudget && !tokenBudget.missing ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">{vg.agentP50Label}</p>
                  <p className="font-semibold">{String(tokenBudget.p50_tokens ?? '—')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{vg.agentP95Label}</p>
                  <p className="font-semibold">{String(tokenBudget.p95_tokens ?? '—')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{vg.agentOverWarnLabel}</p>
                  <p className="font-semibold">{String(tokenBudget.pages_over_warn ?? '—')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{vg.agentOverMaxLabel}</p>
                  <p className="font-semibold">{String(tokenBudget.pages_over_max ?? '—')}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No crawl data available.</p>
            )}
          </Card>

          {/* Oversized pages */}
          {oversizedPages.length > 0 ? (
            <Card className="overflow-hidden mb-6">
              <h3 className="text-sm font-semibold text-foreground px-4 pt-4 pb-2">{vg.agentOversizedTitle}</h3>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>{vg.colUrl}</TableHeadCell>
                    <TableHeadCell>Tokens</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {oversizedPages.slice(0, 20).map((row, i) => {
                    const url = String(row.url || '');
                    return (
                      <TableRow key={`${url}-${i}`}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs break-all">{url}</span>
                            {url ? <UrlInspectorButton url={url} /> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs tabular-nums font-medium text-orange-600">
                            {String(row.token_count ?? '—')}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="p-4 mb-6">
              <p className="text-sm text-muted-foreground">{vg.agentOversizedEmpty}</p>
            </Card>
          )}

          {/* Copy-for-AI */}
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-1">{vg.agentCopyForAiTitle}</h3>
            <p className="text-xs text-muted-foreground mb-3">{vg.agentCopyForAiSubtitle}</p>
            {copyForAi ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">All pages %</p>
                  <p className="font-semibold">{String(copyForAi.all_pages_pct ?? '—')}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Doc pages %</p>
                  <p className="font-semibold">{String(copyForAi.doc_pages_pct ?? '—')}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">UX bridge score</p>
                  <p className="font-semibold">{String(copyForAi.ux_score ?? '—')}/10</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available.</p>
            )}
          </Card>

          {/* Generate bundle CTA */}
          <Card className="p-4 border-violet-500/25 bg-violet-500/5">
            <h3 className="text-sm font-semibold text-foreground mb-1">{vg.agentBundleTitle}</h3>
            <p className="text-xs text-muted-foreground mb-3">{vg.agentBundleSubtitle}</p>
            {!agentBundle ? (
              <button
                onClick={handleGenerateBundle}
                disabled={bundleGenerating || !propertyId}
                className="px-3 py-1.5 text-xs rounded bg-link text-white hover:bg-link/90 disabled:opacity-50"
              >
                {bundleGenerating ? vg.agentBundleGenerating : vg.agentBundleButton}
              </button>
            ) : (
              <div className="space-y-3">
                {Array.isArray(agentBundle.missing_files) && (agentBundle.missing_files as string[]).length > 0 && (
                  <p className="text-xs text-orange-600">
                    {vg.agentBundleMissingLabel}: {(agentBundle.missing_files as string[]).join(', ')}
                  </p>
                )}
                {(['agents_md', 'skill_md', 'agent_permissions_json'] as const).map((key) => {
                  const content = agentBundle[key];
                  if (!content) return null;
                  const labels: Record<string, string> = {
                    agents_md: 'AGENTS.md',
                    skill_md: 'skill.md',
                    agent_permissions_json: 'agent-permissions.json',
                  };
                  return (
                    <div key={key}>
                      <p className="text-xs font-medium text-foreground mb-1">{labels[key]}</p>
                      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                        {String(content)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ))}
    </PageLayout>
  );
}
