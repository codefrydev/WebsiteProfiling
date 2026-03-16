import { useReport } from '../context/useReport';

function priorityBadgeClass(p) {
  if (p === 'Critical') return 'bg-red-500 text-white';
  if (p === 'High') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
}

export default function Issues({ searchQuery = '' }) {
  const { data } = useReport();
  if (!data) return null;

  let list = [];
  (data.categories || []).forEach((cat) => {
    (cat.issues || []).forEach((iss) => {
      list.push({ category: cat.name || cat.id || '', issue: iss });
    });
  });

  const q = (searchQuery || '').toLowerCase();
  if (q) {
    list = list.filter((item) => {
      const msg = (item.issue.message || '').toLowerCase();
      const url = (item.issue.url || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      return msg.includes(q) || url.includes(q) || cat.includes(q);
    });
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Technical Issues</h1>
        <p className="text-slate-400">Prioritized list of actionable fixes based on crawl data.</p>
      </div>
      <div className="space-y-4">
        {list.length === 0 ? (
          <p className="text-slate-500 py-4">No issues recorded.</p>
        ) : (
          list.map((item, i) => {
            const iss = item.issue;
            const p = iss.priority || 'Medium';
            const bColor = priorityBadgeClass(p);
            return (
              <div
                key={i}
                className="bg-brand-800 border border-slate-700 rounded-lg p-5 flex flex-col md:flex-row gap-4 hover:border-slate-600 transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${bColor}`}>
                      {p}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{item.category}</span>
                  </div>
                  <h3 className="text-slate-200 font-medium text-sm">{iss.message || '—'}</h3>
                </div>
                <div className="flex-1 bg-brand-900 rounded p-3 border border-slate-800">
                  <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">Fix Recommendation</div>
                  <p className="text-slate-400 text-sm">{iss.recommendation || '—'}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
