import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Badge } from '../components';

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
    <PageLayout>
      <PageHeader
        title="Technical Issues"
        subtitle="Prioritized list of actionable fixes based on crawl data."
      />
      <div className="space-y-4">
        {list.length === 0 ? (
          <p className="text-slate-500 py-4">No issues recorded.</p>
        ) : (
          list.map((item, i) => {
            const iss = item.issue;
            const p = iss.priority || 'Medium';
            return (
              <Card
                key={i}
                className="flex flex-col md:flex-row gap-4 hover:border-slate-600 transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge value={p} />
                    <span className="text-xs font-semibold text-slate-500">{item.category}</span>
                  </div>
                  <h3 className="text-slate-200 font-medium text-sm">{iss.message || '—'}</h3>
                </div>
                <div className="flex-1 bg-brand-900 rounded p-3 border border-slate-800">
                  <div className="text-xs text-blue-400 font-bold uppercase mb-1">Fix Recommendation</div>
                  <p className="text-slate-400 text-sm">{iss.recommendation || '—'}</p>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </PageLayout>
  );
}
