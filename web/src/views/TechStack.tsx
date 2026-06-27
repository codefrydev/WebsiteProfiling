import type { Chart, TooltipItem } from 'chart.js';
import { useMemo, useState } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Cpu, List } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, ViewTabs, ViewTabPanel, StatCard, ChartTitleWithHint } from '../components';
import type { ViewTabItem } from '../components';
import { palette } from '../utils/chartPalette';
import { getGridColor, getChartCanvasTextColor } from '../utils/chartJsDefaults';
import { anyChartOptions } from '../utils/chartOptions';
import type { TechStackEntry, TechStackSummary, ViewProps } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const barValueLabelsPlugin = {
  id: 'tsBarLabels',
  afterDatasetsDraw(chart: Chart) {
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
      const el = bar as { x: number; y: number };
      const value = dataset.data[i];
      if (value == null || value === 0) return;
      ctx.fillText(Number(value).toLocaleString(), el.x + 6, el.y);
    });
    ctx.restore();
  },
};

const TECH_CATEGORIES: Record<string, string[]> = {
  CMS: ['WordPress', 'Drupal', 'Joomla', 'Hugo', 'Jekyll', 'Shopify', 'Squarespace', 'Wix'],
  'JS Frameworks': ['React', 'Next.js', 'Vue.js', 'Nuxt.js', 'Angular', 'Svelte', 'Gatsby', 'jQuery'],
  'CSS Frameworks': ['Bootstrap', 'Tailwind CSS'],
  Analytics: ['Google Analytics', 'Google Tag Manager', 'Facebook Pixel', 'Hotjar', 'Microsoft Clarity'],
  Infrastructure: ['Cloudflare', 'Nginx', 'Apache', 'LiteSpeed', 'Vercel', 'Netlify', 'GitHub Pages', 'Amazon CloudFront', 'AWS'],
  Fonts: ['Google Fonts', 'Font Awesome'],
};

function categorizeTech(name: string): string {
  const other = strings.views.techStack.categoryOther;
  for (const [cat, techs] of Object.entries(TECH_CATEGORIES)) {
    if (techs.includes(name)) return cat;
  }
  return other;
}

const EMPTY_TS: TechStackSummary = {};

const TECH_STACK_TABS = ['overview', 'breakdown'] as const;
type TechStackTabId = (typeof TECH_STACK_TABS)[number];

export default function TechStack({ searchQuery = '' }: ViewProps) {
  const vr = strings.views.techStack;
  const { data } = useReport();
  useSectionData('tech');
  const techReady = useSectionsViewReady(['tech']);
  const [activeTab, setActiveTab] = useUrlTab(TECH_STACK_TABS, 'overview');
  const q = (searchQuery || '').toLowerCase().trim();
  const ts: TechStackSummary = data?.tech_stack_summary ?? EMPTY_TS;
  const techs = useMemo(() => {
    const all: TechStackEntry[] = ts.technologies || [];
    if (!q) return all;
    return all.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const cat = categorizeTech(t.name || '').toLowerCase();
      const sampleHit = (t.sample_urls || []).some((u) => String(u).toLowerCase().includes(q));
      return name.includes(q) || cat.includes(q) || sampleHit;
    });
  }, [ts.technologies, q]);

  const tabItems = useMemo((): ViewTabItem[] => [
    {
      id: 'overview',
      label: vr.tabs.overview,
      icon: <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      badge: techs.length > 0 ? techs.length : null,
    },
    {
      id: 'breakdown',
      label: vr.tabs.breakdown,
      icon: <List className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      badge: techs.length > 0 ? techs.length : null,
    },
  ], [vr.tabs, techs.length]);

  if (!techReady) {
    return <ViewSectionLoading title={vr.title} />;
  }

  const totalAnalyzed = ts.total_pages_analyzed || 0;
  const emptyMessage =
    (ts.technologies || []).length > 0
      ? vr.noSearchMatch
      : totalAnalyzed > 0
        ? vr.noTechnologiesDetected
        : vr.noData;
  const chartLabels = techs.map((t) => t.name);
  const chartValues = techs.map((t) => t.count);

  const categoryCounts: Record<string, number> = {};
  techs.forEach((t) => {
    const cat = categorizeTech(t.name || '');
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title={vr.title}
        subtitle={format(vr.subtitle, { count: totalAnalyzed.toLocaleString() })}
      />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TechStackTabId)}
        ariaLabel={vr.title}
        idPrefix="tech-stack"
      />

      {activeTab === 'overview' && (
        <ViewTabPanel idPrefix="tech-stack" tabId="overview" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(categoryCounts).slice(0, 4).map(([cat, count]) => (
              <StatCard
                key={cat}
                label={cat}
                value={String(count)}
                sub={vr.techDetectedSuffix}
                hint={metricHelpHint('views.techStack.categoryCount')}
                shadow
              />
            ))}
          </div>

          <Card padding="tight">
            <ChartTitleWithHint as="h3" title={vr.cardDetected} helpKey="views.techStack.detectedChart" />
            <div style={{ height: Math.max(200, techs.length * 28 + 40) }}>
              {chartLabels.length > 0 ? (
                <Bar
                  data={{ labels: chartLabels, datasets: [{ data: chartValues, backgroundColor: palette(chartLabels.length) }] }}
                  options={anyChartOptions({
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx: TooltipItem<'bar'>) =>
                            format(vr.tooltipPages, { count: String(ctx.raw ?? '').toLocaleString() }),
                        },
                      },
                    },
                    scales: {
                      x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: vr.chartAxisPages } },
                      y: { grid: { color: getGridColor() } },
                    },
                  })}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (ts.technologies || []).length > 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{vr.noSearchMatch}</div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{emptyMessage}</div>
              )}
            </div>
          </Card>
        </ViewTabPanel>
      )}

      {activeTab === 'breakdown' && (
        <ViewTabPanel idPrefix="tech-stack" tabId="breakdown">
          {techs.length > 0 ? (
            <Card overflowHidden padding="none">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeadCell className="text-left">{vr.colTechnology}</TableHeadCell>
                    <TableHeadCell className="text-left">{vr.colCategory}</TableHeadCell>
                    <TableHeadCell className="text-right" hint={metricHelpHint('views.techStack.pagesDetected')}>{vr.colPages}</TableHeadCell>
                    <TableHeadCell className="text-left">{vr.colSampleUrls}</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {techs.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-foreground font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{categorizeTech(t.name || '')}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{(t.count ?? 0).toLocaleString()}</TableCell>
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
          ) : (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              {techs.length === 0 ? emptyMessage : vr.noSearchMatch}
            </Card>
          )}
        </ViewTabPanel>
      )}
    </PageLayout>
  );
}
