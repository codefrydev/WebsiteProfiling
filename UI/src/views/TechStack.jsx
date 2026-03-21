import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette, PALETTE_CATEGORICAL } from '../utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

const barValueLabelsPlugin = {
  id: 'tsBarLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const dataset = chart.data.datasets?.[0];
    if (!dataset?.data) return;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(203, 213, 225)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    meta.data.forEach((bar, i) => {
      const value = dataset.data[i];
      if (value == null || value === 0) return;
      ctx.fillText(Number(value).toLocaleString(), bar.x + 6, bar.y);
    });
    ctx.restore();
  },
};

const TECH_CATEGORIES = {
  CMS: ['WordPress', 'Drupal', 'Joomla', 'Shopify', 'Squarespace', 'Wix'],
  'JS Frameworks': ['React', 'Next.js', 'Vue.js', 'Nuxt.js', 'Angular', 'Svelte', 'Gatsby', 'jQuery'],
  'CSS Frameworks': ['Bootstrap', 'Tailwind CSS'],
  Analytics: ['Google Analytics', 'Google Tag Manager', 'Facebook Pixel', 'Hotjar'],
  Infrastructure: ['Cloudflare', 'Nginx', 'Apache', 'LiteSpeed', 'Vercel', 'Netlify', 'Amazon CloudFront', 'AWS'],
  Fonts: ['Google Fonts', 'Font Awesome'],
};

function categorizeTech(name) {
  for (const [cat, techs] of Object.entries(TECH_CATEGORIES)) {
    if (techs.includes(name)) return cat;
  }
  return 'Other';
}

export default function TechStack({ searchQuery = '' }) {
  const { data } = useReport();
  const q = (searchQuery || '').toLowerCase().trim();
  const ts = data?.tech_stack_summary || {};
  const techs = useMemo(() => {
    const all = ts.technologies || [];
    if (!q) return all;
    return all.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const cat = categorizeTech(t.name).toLowerCase();
      const sampleHit = (t.sample_urls || []).some((u) => String(u).toLowerCase().includes(q));
      return name.includes(q) || cat.includes(q) || sampleHit;
    });
  }, [ts.technologies, q]);

  if (!data) return null;

  const totalAnalyzed = ts.total_pages_analyzed || 0;

  const chartLabels = techs.map((t) => t.name);
  const chartValues = techs.map((t) => t.count);

  const categoryCounts = {};
  techs.forEach((t) => {
    const cat = categorizeTech(t.name);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  return (
    <PageLayout className="space-y-8">
      <PageHeader
        title="Tech Detection"
        subtitle={`Technologies detected across ${totalAnalyzed.toLocaleString()} analyzed pages.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {Object.entries(categoryCounts).slice(0, 4).map(([cat, count]) => (
          <Card key={cat} shadow>
            <div className="text-xs text-slate-500 uppercase font-bold mb-1">{cat}</div>
            <div className="text-2xl font-bold text-bright">{count}</div>
            <div className="text-[10px] text-slate-500 mt-1">technologies detected</div>
          </Card>
        ))}
      </div>

      <Card padding="tight">
        <h3 className="text-sm font-bold text-slate-200 mb-1">Detected Technologies</h3>
        <p className="text-xs text-slate-500 mb-3">Number of pages where each technology was found</p>
        <div style={{ height: Math.max(200, techs.length * 28 + 40) }}>
          {chartLabels.length > 0 ? (
            <Bar
              data={{ labels: chartLabels, datasets: [{ data: chartValues, backgroundColor: palette(chartLabels.length) }] }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx) => ` Found on ${ctx.raw.toLocaleString()} page(s)` } },
                },
                scales: {
                  x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Pages' } },
                  y: { grid: { color: GRID_COLOR } },
                },
              }}
              plugins={[barValueLabelsPlugin]}
            />
          ) : (ts.technologies || []).length > 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No technologies match your search.</div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No technology data. Run a crawl first.</div>
          )}
        </div>
      </Card>

      {techs.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-bright mb-4">Technology Breakdown</h2>
          <Card overflowHidden padding="none">
            <Table>
              <TableHead>
                <tr>
                  <TableHeadCell className="text-left">Technology</TableHeadCell>
                  <TableHeadCell className="text-left">Category</TableHeadCell>
                  <TableHeadCell className="text-right">Pages</TableHeadCell>
                  <TableHeadCell className="text-left">Sample URLs</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {techs.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-slate-200 font-medium">{t.name}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{categorizeTech(t.name)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-400">{t.count.toLocaleString()}</TableCell>
                    <TableCell className="text-xs max-w-md">
                      {(t.sample_urls || []).map((u, j) => (
                        <a key={j} href={u} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline block truncate">
                          {u.replace(/^https?:\/\//, '').slice(0, 60)}
                        </a>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
