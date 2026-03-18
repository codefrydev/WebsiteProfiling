import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Badge } from '../components';

export default function Redirects() {
  const { data } = useReport();
  if (!data) return null;

  const redirects = data.redirects || [];

  return (
    <PageLayout>
      <PageHeader
        title="Redirects"
        subtitle="URLs that redirect to another location. From → To."
      />
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
        ) : (
          <p className="p-6 text-center text-slate-500">No redirects found.</p>
        )}
      </Card>
    </PageLayout>
  );
}
