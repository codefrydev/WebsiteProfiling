import { useState } from 'react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Badge } from '../components';

const selectClass = 'bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none';

export default function Security() {
  const { data } = useReport();
  const [severityFilter, setSeverityFilter] = useState('All');

  if (!data) return null;

  let findings = data.security_findings || [];
  if (severityFilter !== 'All') {
    findings = findings.filter((f) => (f.severity || '') === severityFilter);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Security & Vulnerabilities"
        subtitle="Findings from passive and optional active security scanning (headers, injection risk, open redirect, etc.)."
      />
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <span className="text-sm text-slate-500">Filter by severity:</span>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={selectClass}
        >
          <option value="All">All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="Info">Info</option>
        </select>
      </div>
      <Card overflowHidden padding="none">
        {findings.length > 0 ? (
          <Table>
            <TableHead>
              <tr>
                <TableHeadCell>Severity</TableHeadCell>
                <TableHeadCell>Type</TableHeadCell>
                <TableHeadCell>URL</TableHeadCell>
                <TableHeadCell>Message</TableHeadCell>
                <TableHeadCell>Recommendation</TableHeadCell>
              </tr>
            </TableHead>
            <TableBody>
              {findings.map((f, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge value={f.severity || 'Info'} label={f.severity || 'Info'} />
                  </TableCell>
                  <TableCell className="text-slate-400 font-mono text-xs">
                    {(f.finding_type || '').replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="font-mono text-blue-400 text-xs break-all">
                    <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {f.url || '—'}
                    </a>
                  </TableCell>
                  <TableCell className="text-slate-200">{f.message || '—'}</TableCell>
                  <TableCell className="text-slate-400 text-sm">{f.recommendation || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-center text-slate-500">No security findings.</p>
        )}
      </Card>
    </PageLayout>
  );
}
