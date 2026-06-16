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
  const [faq, setFaq] = useState<Record<string, unknown> | null>(null);
  const [eeat, setEeat] = useState<Record<string, unknown> | null>(null);
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
      fetchAuditTool({ toolName: 'get_faq_schema_coverage', propertyId, reportId }),
      fetchAuditTool({ toolName: 'get_eeat_signals_summary', propertyId, reportId }),
      fetchAuditTool({
        toolName: 'list_pages_missing_faq_schema',
        propertyId,
        reportId,
        args: { limit: 200 },
      }),
    ])
      .then(([geo, llmsTxt, faqCov, eeatSum, faqList]) => {
        if (cancelled) return;
        setGeoScore(geo);
        setLlms(llmsTxt);
        setFaq(faqCov);
        setEeat(eeatSum);
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
  const components = (geoScore?.components || {}) as Record<string, number>;

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label={vg.scoreLabel} value={score} />
            <StatCard label={vg.faqCoverageLabel} value={`${faq?.coverage_pct ?? '—'}%`} />
            <StatCard
              label={vg.llmsLabel}
              value={llms?.found ? vg.llmsFound : vg.llmsMissing}
            />
            <StatCard label={vg.faqPagesLabel} value={Number(faq?.pages_with_faq_schema) || 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{vg.componentsTitle}</h3>
              <ul className="space-y-2">
                {Object.entries(components).map(([key, val]) => (
                  <li key={key} className="flex justify-between text-sm gap-4">
                    <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums font-medium">{val}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{vg.llmsPanelTitle}</h3>
              {llms?.found ? (
                <>
                  <p className="text-xs font-mono text-foreground break-all">{String(llms.url || '')}</p>
                  {llms.preview ? (
                    <pre className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                      {String(llms.preview)}
                    </pre>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{vg.llmsNotFoundHint}</p>
              )}
            </Card>
          </div>

          {eeat ? (
            <Card className="p-4 mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-2">{vg.eeatTitle}</h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48">
                {JSON.stringify(eeat, null, 2)}
              </pre>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
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
        </>
      )}
    </PageLayout>
  );
}
