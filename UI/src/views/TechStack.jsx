import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette } from '../utils/chartPalette';
import { getGridColor, getChartCanvasTextColor } from '../utils/chartJsDefaults';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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
    ctx.fillStyle = getChartCanvasTextColor();
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
  const other = strings.views.techStack.categoryOther;
  for (const [cat, techs] of Object.entries(TECH_CATEGORIES)) {
    if (techs.includes(name)) return cat;
  }
  return other;
}

export default function TechStack({ searchQuery = '' }) {
  const vr = strings.views.techStack;
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
        title={vr.title}
        subtitle={format(vr.subtitle, { count: totalAnalyzed.toLocaleString() })}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {Object.entries(categoryCounts).slice(0, 4).map(([cat, count]) => (
          <Card key={cat} shadow>
            <div className="text-xs text-muted-foreground uppercase font-bold mb-1">{cat}</div>
            <div className="text-2xl font-bold text-bright">{count}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{vr.techDetectedSuffix}</div>
          </Card>
        ))}
      </div>

      <Card padding="tight">
        <h3 className="text-sm font-bold text-foreground mb-1">{vr.cardDetected}</h3>
        <p className="text-xs text-muted-foreground mb-3">{vr.cardHint}</p>
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
                  tooltip: {
                    callbacks: {
                      label: (ctx) => format(vr.tooltipPages, { count: ctx.raw.toLocaleString() }),
                    },
                  },
                },
                scales: {
                  x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: vr.chartAxisPages } },
                  y: { grid: { color: getGridColor() } },
                },
              }}
              plugins={[barValueLabelsPlugin]}
            />
          ) : (ts.technologies || []).length > 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{vr.noSearchMatch}</div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{vr.noData}</div>
          )}
        </div>
      </Card>

      {techs.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-bright mb-4">{vr.breakdownTitle}</h2>
          <Card overflowHidden padding="none">
            <Table>
              <TableHead>
                <tr>
                  <TableHeadCell className="text-left">{vr.colTechnology}</TableHeadCell>
                  <TableHeadCell className="text-left">{vr.colCategory}</TableHeadCell>
                  <TableHeadCell className="text-right">{vr.colPages}</TableHeadCell>
                  <TableHeadCell className="text-left">{vr.colSampleUrls}</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody>
                {techs.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-foreground font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{categorizeTech(t.name)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{t.count.toLocaleString()}</TableCell>
                    <TableCell className="text-xs max-w-md">
                      {(t.sample_urls || []).map((u, j) => (
                        <a key={j} href={u} target="_blank" rel="noreferrer" className="text-link hover:underline block truncate">
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
