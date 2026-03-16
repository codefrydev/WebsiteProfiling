import { Globe, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';
import { useReport } from '../context/useReport';

export default function Overview() {
  const { data } = useReport();
  if (!data) return null;

  const s = data.summary || {};
  const siteName = data.site_name || 'Site';
  const h1Zero = (data.seo_health && data.seo_health.h1_zero) || 0;
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Executive Summary</h1>
        <p className="text-slate-400">
          High-level crawl analytics for <span className="text-blue-400">{siteName}</span>.{' '}
          {s.crawl_time_s != null ? `Crawl completed in ${s.crawl_time_s}s.` : 'Crawl completed.'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-brand-800 border border-slate-700 p-5 rounded-xl shadow-sm">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" /> Total URLs
          </div>
          <div className="text-3xl font-bold text-white">{(s.total_urls || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-2">{s.avg_outlinks ?? 0} Avg Outlinks / Page</div>
        </div>
        <div className="bg-brand-800 border border-slate-700 p-5 rounded-xl shadow-sm">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> Success Rate (2xx)
          </div>
          <div className="text-3xl font-bold text-green-400">{s.success_rate ?? 0}%</div>
        </div>
        <div className="bg-brand-800 border border-red-900/30 p-5 rounded-xl shadow-sm ring-1 ring-red-500/20">
          <div className="text-red-400/80 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Broken (4xx/5xx)
          </div>
          <div className="text-3xl font-bold text-red-500">{brokenCount}</div>
          <div className="text-xs text-slate-400 mt-2">{s.count_4xx ?? 0} 4xx, {s.count_5xx ?? 0} 5xx</div>
        </div>
        <div className="bg-brand-800 border border-slate-700 p-5 rounded-xl shadow-sm">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" /> Missing H1s
          </div>
          <div className="text-3xl font-bold text-yellow-500">{h1Zero}</div>
        </div>
      </div>

      {data.site_level && (data.site_level.robots_present != null || data.site_level.sitemap_present != null) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-3">Site Configuration</h2>
          <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">robots.txt:</span>
              <span className="font-semibold text-slate-200">{data.site_level.robots_present ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">sitemap.xml:</span>
              <span className="font-semibold text-slate-200">
                {data.site_level.sitemap_present ? 'Yes' : 'No'}
                {data.site_level.sitemap_valid === true ? ' (valid)' : data.site_level.sitemap_present ? ' (invalid or unparsed)' : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {(data.recommendations || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-3">Recommendations</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            {data.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Top Pages by Importance</h2>
        {(data.top_pages || []).length > 0 ? (
          <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-900 text-slate-400 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Page</th>
                  <th className="px-4 py-3 text-left">URL</th>
                  <th className="px-4 py-3 text-right">PageRank</th>
                  <th className="px-4 py-3 text-right">Degree</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.top_pages.map((p, i) => (
                  <tr key={i} className="hover:bg-brand-900/50">
                    <td className="px-4 py-2 text-slate-200 font-medium">{p.title || p.url}</td>
                    <td className="px-4 py-2 font-mono text-blue-400 text-xs truncate max-w-xs">
                      <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-400">
                      {p.pagerank != null ? Number(p.pagerank).toFixed(5) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-400">
                      {p.degree ?? p.outlinks ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">No top pages data (crawl had no edges or outlinks).</p>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold text-white mb-4">Health by Category</h2>
        {data.categories && data.categories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {data.categories.map((cat, i) => {
              const score = cat.score != null ? Math.min(100, Math.max(0, cat.score)) : 0;
              const label = score >= 80 ? 'Good' : score >= 50 ? 'Needs Improvement' : 'Critical';
              const labelCls = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-500';
              const color = score >= 80 ? '#22C55E' : score >= 50 ? '#EAB308' : '#EF4444';
              return (
                <div key={i} className="bg-brand-800 border border-slate-700 p-5 rounded-xl flex items-center gap-6">
                  <div className="w-20 h-20 relative shrink-0">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1F2937"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeDasharray={`${score}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-white">
                      {cat.score != null ? cat.score : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">{cat.name || cat.id || ''}</h3>
                    <p className={`text-sm mt-1 ${labelCls}`}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500">No category data.</p>
        )}
      </div>
    </div>
  );
}
