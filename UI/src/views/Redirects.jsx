import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Badge } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';

registerChartJsBase();

export default function Redirects({ searchQuery = '' }) {
  const { data } = useReport();
  const q = (searchQuery || '').toLowerCase().trim();
  const redirects = useMemo(() => {
    const all = data?.redirects || [];
    if (!q) return all;
    return all.filter((r) => {
      const from = String(r.url || r.from || '').toLowerCase();
      const to = String(r.final_url || r.to || '').toLowerCase();
      const st = String(r.status ?? '').toLowerCase();
      return from.includes(q) || to.includes(q) || st.includes(q);
    });
  }, [data?.redirects, q]);

  const { statusLabels, statusValues } = useMemo(() => {
    const map = new Map();
    redirects.forEach((r) => {
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
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} redirect${n !== 1 ? 's' : ''}`;
            },
          },
        },
      },
    };
  }, []);

  if (!data) return null;

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Redirects"
        subtitle="URLs that redirect to another location. From → To."
      />
      {redirects.length > 0 && statusLabels.length > 0 && (
        <Card padding="tight" shadow>
          <h2 className="text-sm font-bold text-slate-200 mb-1">Redirects by status code</h2>
          <p className="text-xs text-slate-500 mb-3">How many redirect responses use each HTTP status</p>
          <div className="h-48 max-w-xl">
            <Bar
              data={{
                labels: statusLabels,
                datasets: [{ data: statusValues, backgroundColor: palette(statusLabels.length), label: 'Redirects' }],
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
                <TableHeadCell>From (requested URL)</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>To (final URL)</TableHeadCell>
              </tr>
            </TableHead>
            <TableBody>
              {redirects.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-blue-400 text-xs break-all py-3">
                    <a href={r.url || r.from} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.url || r.from}
                    </a>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge value={r.status || ''} />
                  </TableCell>
                  <TableCell className="font-mono text-slate-400 text-xs break-all py-3">
                    <a href={r.final_url || r.to} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.final_url || r.to}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (data.redirects || []).length > 0 ? (
          <p className="p-6 text-center text-slate-500">No redirects match your search.</p>
        ) : (
          <p className="p-6 text-center text-slate-500">No redirects found.</p>
        )}
      </Card>
    </PageLayout>
  );
}
