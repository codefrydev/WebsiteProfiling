'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Globe2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { strings, format } from '../lib/strings';
import {
  PageLayout,
  PageHeader,
  Card,
  StatCard,
  Badge,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
} from '../components';
import { metricHelpHint } from '@/lib/metricHelp';
import type { SubdomainHostEntry, ViewProps } from '@/types';

function yesNo(value: boolean | undefined): string {
  return value ? strings.common.yes : strings.common.no;
}

export default function Subdomains({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  const techStatus = useSectionData('tech');
  const searchParams = useSearchParams();
  const vs = strings.views.subdomains;
  const inv = data?.subdomains;
  const q = (searchQuery || '').toLowerCase().trim();

  const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const inScopeHosts = useMemo(() => {
    const all = (inv?.hosts || []).filter((h): h is SubdomainHostEntry & { host: string } => Boolean(h.host));
    const scoped = all.filter((h) => h.in_scope !== false);
    if (!q) return scoped;
    return scoped.filter((h) => {
      const host = h.host.toLowerCase();
      const sources = (h.sources || []).join(' ').toLowerCase();
      return host.includes(q) || sources.includes(q);
    });
  }, [inv?.hosts, q]);

  const gscGapHosts = inv?.gsc_hosts_not_crawled || [];
  const outOfScope = inv?.out_of_scope_discovered || [];

  if (techStatus === 'idle' || techStatus === 'loading') {
    return <ViewSectionLoading title={vs.title} />;
  }

  if (!inv || inv.disabled) {
    return (
      <PageLayout>
        <PageHeader title={vs.title} subtitle={vs.subtitle} icon={<Globe2 className="h-7 w-7 text-link shrink-0" />} />
        <Card>
          <p className="text-sm text-muted-foreground">{vs.disabledHint}</p>
        </Card>
      </PageLayout>
    );
  }

  if (!inv.hosts?.length && !gscGapHosts.length) {
    return (
      <PageLayout>
        <PageHeader title={vs.title} subtitle={vs.subtitle} icon={<Globe2 className="h-7 w-7 text-link shrink-0" />} />
        <Card>
          <p className="text-sm text-muted-foreground">{vs.emptyHint}</p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={vs.title} subtitle={vs.subtitle} icon={<Globe2 className="h-7 w-7 text-link shrink-0" />} />
      {inv.crtsh_error ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-muted-foreground">{vs.ctWarning}</p>
        </Card>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label={vs.apex} value={inv.apex || '—'} hint={metricHelpHint('views.subdomains.apex')} />
        <StatCard label={vs.inScopeHosts} value={inScopeHosts.length} hint={metricHelpHint('views.subdomains.inScopeHosts')} />
        <StatCard label={vs.gscNotCrawled} value={gscGapHosts.length} hint={metricHelpHint('views.subdomains.gscNotCrawled')} />
        <StatCard label={vs.outOfScope} value={outOfScope.length} hint={metricHelpHint('views.subdomains.outOfScope')} />
      </div>
      {gscGapHosts.length > 0 ? (
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">{vs.gscGapTitle}</h3>
          <p className="text-sm text-muted-foreground mb-3">{vs.gscGapHint}</p>
          <ul className="flex flex-wrap gap-2">
            {gscGapHosts.slice(0, 20).map((host) => (
              <li key={host}>
                <Badge variant="medium" value={host} className="normal-case font-mono text-[11px]" />
              </li>
            ))}
          </ul>
          {gscGapHosts.length > 20 ? (
            <p className="text-xs text-muted-foreground mt-2">{format(vs.moreHosts, { count: gscGapHosts.length - 20 })}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-3">
            <Link href={`/indexation${querySuffix}`} className="text-link hover:underline">
              {vs.viewIndexation}
            </Link>
          </p>
        </Card>
      ) : null}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">{vs.hostsTitle}</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colHost')}>{vs.colHost}</TableHeadCell>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colSources')}>{vs.colSources}</TableHeadCell>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colCrawl')}>{vs.colCrawl}</TableHeadCell>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colGsc')}>{vs.colGsc}</TableHeadCell>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colCrawlUrls')}>{vs.colCrawlUrls}</TableHeadCell>
                <TableHeadCell hint={metricHelpHint('views.subdomains.colGscUrls')}>{vs.colGscUrls}</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inScopeHosts.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground text-sm">{vs.noSearchResults}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                </TableRow>
              ) : (
                inScopeHosts.map((row) => (
                  <TableRow key={row.host}>
                    <TableCell className="font-mono text-xs">{row.host}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(row.sources || []).map((s) => (
                          <Badge key={s} variant="info" value={s} className="normal-case text-[10px]" />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{yesNo(row.in_crawl)}</TableCell>
                    <TableCell>{yesNo(row.in_gsc)}</TableCell>
                    <TableCell>{row.url_count_crawl ?? 0}</TableCell>
                    <TableCell>{row.url_count_gsc ?? 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      {outOfScope.length > 0 ? (
        <Card className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">{vs.outOfScopeTitle}</h3>
          <p className="text-sm text-muted-foreground mb-3">{vs.outOfScopeHint}</p>
          <ul className="text-sm font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
            {outOfScope.slice(0, 30).map((host) => (
              <li key={host} className="text-muted-foreground">
                {host}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageLayout>
  );
}
