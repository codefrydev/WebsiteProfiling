import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Badge } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';
import type { ReportRedirect, ViewProps } from '@/types';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildRedirectContext } from '@/lib/fixSuggestionContext';

registerChartJsBase();

export default function Redirects({ searchQuery = '' }: ViewProps) {
  const vr = strings.views.redirects;
  const { data } = useReport();
  const q = (searchQuery || '').toLowerCase().trim();
  const redirects = useMemo((): ReportRedirect[] => {
    const all = (data?.redirects || []) as ReportRedirect[];
    if (!q) return all;
    return all.filter((r) => {
      const from = String(r.url || r.from || '').toLowerCase();
      const to = String(r.final_url || r.to || '').toLowerCase();
      const st = String(r.status ?? '').toLowerCase();
      return from.includes(q) || to.includes(q) || st.includes(q);
    });
  }, [data?.redirects, q]);

  const { statusLabels, statusValues } = useMemo(() => {
    const map = new Map<string, number>();
    redirects.forEach((r: ReportRedirect) => {
      const s = String(r.status ?? '—').trim() || '—';
      map.set(s, (map.get(s) || 0) + 1);
    });
    const pairs = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return {
      statusLabels: pairs.map((p) => p[0]),
      statusValues: pairs.map((p) => p[1]),
    };
  }, [redirects]);

  const barOpts = useMemo(() => {
    const base = barOptionsHorizontal(undefined, statusLabels);
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} redirect${n !== 1 ? 's' : ''}`;
            },
          },
        },
      },
    };
  }, [statusLabels]);

  if (!data) return null;

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vr.title} subtitle={vr.subtitle} />
      {redirects.length > 0 && statusLabels.length > 0 && (
        <Card padding="tight" shadow overflowHidden className="min-w-0 max-w-full">
          <h2 className="text-sm font-bold text-foreground mb-1">{vr.chartTitle}</h2>
          <p className="text-xs text-muted-foreground mb-3">{vr.chartHint}</p>
          <div className="relative h-48 min-w-0 w-full max-w-xl overflow-hidden">
            <Bar
              data={{
                labels: statusLabels,
                datasets: [{ data: statusValues, backgroundColor: palette(statusLabels.length), label: vr.datasetLabel }],
              }}
              options={barOpts}
            />
          </div>
        </Card>
      )}
      <Card overflowHidden padding="none">
        {redirects.length > 0 ? (
          <Table>
            <TableHead>
              <tr>
                <TableHeadCell>{vr.colFrom}</TableHeadCell>
                <TableHeadCell>{vr.colStatus}</TableHeadCell>
                <TableHeadCell>{vr.colTo}</TableHeadCell>
                <TableHeadCell className="w-36" />
              </tr>
            </TableHead>
            <TableBody>
              {redirects.map((r, i) => (
                <TableRow key={i} className="align-top">
                  <TableCell className="font-mono text-link text-xs break-all py-3">
                    <a href={r.url || r.from} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.url || r.from}
                    </a>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge value={r.status || ''} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs break-all py-3">
                    <a href={r.final_url || r.to} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.final_url || r.to}
                    </a>
                  </TableCell>
                  <TableCell className="py-3">
                    <AiSuggestionButton request={buildRedirectContext(r)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (data.redirects || []).length > 0 ? (
          <p className="p-6 text-center text-muted-foreground">{vr.noSearchMatch}</p>
        ) : (
          <p className="p-6 text-center text-muted-foreground">{vr.noneFound}</p>
        )}
      </Card>
    </PageLayout>
  );
}
