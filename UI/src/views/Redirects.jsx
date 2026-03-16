import { useReport } from '../context/useReport';

export default function Redirects() {
  const { data } = useReport();
  if (!data) return null;

  const redirects = data.redirects || [];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Redirects</h1>
        <p className="text-slate-400">URLs that redirect to another location. From → To.</p>
      </div>
      <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-900 text-slate-400 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">From (requested URL)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">To (final URL)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {redirects.map((r, i) => (
                <tr key={i} className="hover:bg-brand-900/50">
                  <td className="px-6 py-3 font-mono text-blue-400 text-xs break-all">
                    <a href={r.url || r.from} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.url || r.from}
                    </a>
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      {String(r.status || '')}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-slate-400 text-xs break-all">
                    <a href={r.final_url || r.to} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.final_url || r.to}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {redirects.length === 0 && (
          <p className="p-6 text-center text-slate-500">No redirects found.</p>
        )}
      </div>
    </div>
  );
}
