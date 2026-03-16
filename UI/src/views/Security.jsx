import { useState } from 'react';
import { useReport } from '../context/useReport';

function severityClass(s) {
  if (s === 'Critical') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  if (s === 'High') return 'bg-red-500/10 text-red-300 border border-red-500/20';
  if (s === 'Medium') return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
  if (s === 'Low') return 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
  return 'bg-slate-600/20 text-slate-500 border border-slate-600/30';
}

export default function Security() {
  const { data } = useReport();
  const [severityFilter, setSeverityFilter] = useState('All');

  if (!data) return null;

  let findings = data.security_findings || [];
  if (severityFilter !== 'All') {
    findings = findings.filter((f) => (f.severity || '') === severityFilter);
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Security & Vulnerabilities</h1>
        <p className="text-slate-400">
          Findings from passive and optional active security scanning (headers, injection risk, open redirect, etc.).
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <span className="text-sm text-slate-500">Filter by severity:</span>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none"
        >
          <option value="All">All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="Info">Info</option>
        </select>
      </div>
      <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-900 text-slate-400 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Severity</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">URL</th>
                <th className="px-6 py-4">Message</th>
                <th className="px-6 py-4">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {findings.map((f, i) => (
                <tr key={i} className="hover:bg-brand-900/50">
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${severityClass(f.severity || 'Info')}`}>
                      {f.severity || 'Info'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-400 font-mono text-xs">
                    {(f.finding_type || '').replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-3 font-mono text-blue-400 text-xs break-all">
                    <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {f.url || '—'}
                    </a>
                  </td>
                  <td className="px-6 py-3 text-slate-200">{f.message || '—'}</td>
                  <td className="px-6 py-3 text-slate-400 text-sm">{f.recommendation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {findings.length === 0 && (
          <p className="p-6 text-center text-slate-500">No security findings.</p>
        )}
      </div>
    </div>
  );
}
