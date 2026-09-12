
import { useId } from 'react';
import {
  CompactWidget,
  CompactKpi,
  CompactDonut,
  CompactBarChart,
  CompactAreaSparkline,
  CompactHorizontalBars,
  CompactStackedBar,
} from '@/components/charts/compact';

export type LandingProductMockVariant =
  | 'default'
  | 'crawl'
  | 'issues'
  | 'promptGenerator'
  | 'google'
  | 'contentStudio'
  | 'aiChat'
  | 'compareExport';

interface LandingProductMockProps {
  variant?: LandingProductMockVariant;
  className?: string;
  elevated?: boolean;
  compact?: boolean;
  /** Stretch to fill a split-column visual area (hero / spotlights). */
  fillHeight?: boolean;
}

const NAV_ITEMS = [
  { label: 'Overview', activeFor: ['default'] as const },
  { label: 'Issues', activeFor: ['issues', 'promptGenerator'] as const },
  { label: 'All URLs', activeFor: ['crawl'] as const },
  { label: 'Search', activeFor: ['google'] as const },
  { label: 'Write', activeFor: ['contentStudio'] as const },
  { label: 'Chat', activeFor: ['aiChat'] as const },
  { label: 'Compare', activeFor: ['compareExport'] as const },
  { label: 'Export', activeFor: ['compareExport'] as const },
];

const MOCK_PATHS: Record<LandingProductMockVariant, string> = {
  default: 'overview',
  crawl: 'links',
  issues: 'issues',
  promptGenerator: 'issues',
  google: 'search-performance',
  contentStudio: 'write',
  aiChat: 'chat',
  compareExport: 'compare',
};

const MOCK_GSC_BAR_HEIGHTS = [40, 65, 52, 78, 45, 88, 60, 72, 55, 80, 68, 92];

function MockLineChart({ label }: { label?: string }) {
  const fillId = useId();
  const points = [12, 18, 15, 22, 19, 28, 24, 32, 29, 38, 34, 42];
  const max = Math.max(...points);
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - (p / max) * 85}`)
    .join(' ');

  return (
    <CompactWidget title={label ?? 'Trend'}>
      <svg viewBox="0 0 100 40" className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeOpacity="0.12" strokeWidth="0.5" />
        ))}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-md-sys-primary"
          points={coords}
        />
        <polyline fill={`url(#${fillId})`} stroke="none" points={`0,100 ${coords} 100,100`} />
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246 / 0.3)" />
            <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="mt-1 flex justify-between text-[8px] text-md-sys-on-surface-variant">
        <span>Week 1</span>
        <span>Week 4</span>
      </div>
    </CompactWidget>
  );
}

const SCORE_RING_STROKE: Record<string, string> = {
  'text-md-sys-primary': 'stroke-md-sys-primary',
  'text-md-sys-warning': 'stroke-md-sys-warning',
  'text-md-sys-success': 'stroke-md-sys-success',
};

function MockScoreRing({
  score,
  label,
  color = 'text-md-sys-primary',
}: {
  score: number;
  label: string;
  color?: string;
}) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;
  const strokeClass = SCORE_RING_STROKE[color] ?? SCORE_RING_STROKE['text-md-sys-primary'];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r="18" fill="none" className="stroke-md-sys-surface-container-high/80" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            className={strokeClass}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-md-sys-on-surface">
          {score}
        </span>
      </div>
      <span className="mt-1 text-[8px] font-medium uppercase tracking-wide text-md-sys-on-surface-variant">{label}</span>
    </div>
  );
}

function MockIssueRow({ severity, title }: { severity: string; title: string }) {
  const severityClass =
    severity === 'Critical'
      ? 'bg-md-sys-error-container text-md-sys-on-error-container'
      : severity === 'High'
        ? 'bg-md-sys-warning-container text-md-sys-on-warning-container'
        : 'bg-md-sys-primary-container text-md-sys-on-primary-container';
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/30 px-2.5 py-1.5">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase ${severityClass}`}>
        {severity}
      </span>
      <span className="min-w-0 truncate text-[10px] text-md-sys-on-surface">{title}</span>
    </div>
  );
}

function MockUrlRow({ path, status }: { path: string; status: number }) {
  const statusClass = status >= 400 ? 'text-md-sys-error font-medium' : status >= 300 ? 'text-md-sys-warning font-medium' : 'text-md-sys-success font-medium';
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/30 px-2.5 py-1.5">
      <span className={`shrink-0 text-[9px] font-mono tabular-nums ${statusClass}`}>{status}</span>
      <span className="min-w-0 truncate text-[10px] text-md-sys-on-surface-variant">{path}</span>
    </div>
  );
}

function isNavActive(activeFor: readonly string[], variant: LandingProductMockVariant) {
  return activeFor.includes(variant);
}

function CrawlPanel() {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <CompactKpi label="URLs" value="4,821" delta="+12%" />
        <CompactKpi label="2xx rate" value="96%" accent />
        <CompactKpi label="Redirects" value="142" />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <CompactWidget title="Status codes">
          <CompactDonut
            centerValue="96%"
            centerLabel="2xx"
            segments={[
              { label: '2xx', value: 96, color: 'rgb(52 211 153 / 0.85)' },
              { label: '3xx', value: 3, color: 'rgb(251 191 36 / 0.85)' },
              { label: '4xx', value: 1, color: 'rgb(248 113 113 / 0.85)' },
            ]}
          />
        </CompactWidget>
        <CompactWidget title="Crawl depth">
          <CompactHorizontalBars
            items={[
              { label: 'Depth 0', value: 1, color: 'rgb(59 130 246 / 0.7)' },
              { label: 'Depth 1', value: 48, color: 'rgb(59 130 246 / 0.55)' },
              { label: 'Depth 2', value: 312, color: 'rgb(59 130 246 / 0.45)' },
              { label: 'Depth 3+', value: 890, color: 'rgb(59 130 246 / 0.35)' },
            ]}
          />
        </CompactWidget>
      </div>
      <CompactWidget title="Recent URLs" className="mb-0">
        <div className="space-y-1">
          <MockUrlRow path="/products/widget-a" status={200} />
          <MockUrlRow path="/blog/seo-guide" status={200} />
          <MockUrlRow path="/old-page" status={301} />
        </div>
      </CompactWidget>
    </>
  );
}

function IssuesPanel() {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-[auto_1fr_1fr] gap-2">
        <div className="flex items-center justify-center rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 px-2">
          <MockScoreRing score={78} label="Health" color="text-md-sys-primary" />
        </div>
        <CompactKpi label="Open issues" value="234" />
        <CompactKpi label="Critical" value="12" accent />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <CompactWidget title="By severity">
          <CompactStackedBar
            segments={[
              { label: 'Critical', value: 12, color: 'rgb(248 113 113 / 0.9)' },
              { label: 'High', value: 48, color: 'rgb(251 191 36 / 0.9)' },
              { label: 'Med', value: 94, color: 'rgb(59 130 246 / 0.7)' },
              { label: 'Low', value: 80, color: 'rgb(100 116 139 / 0.6)' },
            ]}
          />
        </CompactWidget>
        <CompactWidget title="Issue trend">
          <CompactAreaSparkline points={[42, 38, 35, 40, 32, 28, 26, 24]} />
          <p className="mt-1 text-[8px] text-md-sys-success">↓ 18% vs last crawl</p>
        </CompactWidget>
      </div>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5 rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 p-2">
        <MockScoreRing score={72} label="Perf" color="text-md-sys-warning" />
        <MockScoreRing score={91} label="SEO" color="text-md-sys-success" />
        <MockScoreRing score={88} label="A11y" color="text-md-sys-primary" />
      </div>
      <CompactWidget title="Top issues">
        <div className="space-y-1">
          <MockIssueRow severity="Critical" title="Missing title tags (48)" />
          <MockIssueRow severity="High" title="Slow LCP mobile (23)" />
          <MockIssueRow severity="Medium" title="Duplicate meta desc." />
        </div>
      </CompactWidget>
    </>
  );
}

function OverviewPanel() {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <CompactKpi label="Health" value="82" accent delta="+4" />
        <CompactKpi label="URLs" value="1,247" />
        <CompactKpi label="Issues" value="89" delta="-11" />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <CompactWidget title="GSC clicks (28d)">
          <CompactBarChart heights={MOCK_GSC_BAR_HEIGHTS} />
        </CompactWidget>
        <CompactWidget title="Issue mix">
          <CompactDonut
            segments={[
              { label: 'High', value: 22, color: 'rgb(251 191 36 / 0.9)' },
              { label: 'Medium', value: 45, color: 'rgb(59 130 246 / 0.75)' },
              { label: 'Low', value: 33, color: 'rgb(100 116 139 / 0.55)' },
            ]}
          />
        </CompactWidget>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <MockLineChart label="Organic trend" />
        <CompactWidget title="Lighthouse">
          <div className="flex justify-around px-1">
            <MockScoreRing score={84} label="Perf" color="text-md-sys-success" />
            <MockScoreRing score={96} label="SEO" color="text-md-sys-primary" />
          </div>
        </CompactWidget>
      </div>
      <CompactWidget title="Needs attention">
        <div className="space-y-1">
          <MockIssueRow severity="High" title="Missing canonical /blog/*" />
          <MockIssueRow severity="Medium" title="Images missing alt text" />
        </div>
      </CompactWidget>
    </>
  );
}

function GooglePanel() {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <CompactKpi label="Clicks" value="12.4k" delta="+8%" accent />
        <CompactKpi label="Impressions" value="284k" />
        <CompactKpi label="CTR" value="4.4%" />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <CompactWidget title="GSC clicks (28d)">
          <CompactBarChart heights={MOCK_GSC_BAR_HEIGHTS} />
        </CompactWidget>
        <CompactWidget title="GA4 traffic">
          <div className="grid grid-cols-2 gap-2">
            <CompactKpi label="Sessions" value="8,412" delta="+5%" />
            <CompactKpi label="Users" value="6,203" />
          </div>
        </CompactWidget>
      </div>
      <CompactWidget title="Top queries" className="mb-0">
        <div className="space-y-1">
          <MockUrlRow path="seo audit guide" status={200} />
          <MockUrlRow path="screaming frog alternative" status={200} />
          <MockUrlRow path="self hosted seo tool" status={200} />
        </div>
      </CompactWidget>
    </>
  );
}

function MockTermRow({ term, count, target, tone }: { term: string; count: number; target: number; tone: 'ok' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'ok' ? 'bg-md-sys-success' : tone === 'warn' ? 'bg-md-sys-warning' : 'bg-md-sys-error';
  const pct = Math.min(100, Math.round((count / Math.max(target, 1)) * 100));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-[9px]">
        <span className="truncate text-md-sys-on-surface">{term}</span>
        <span className="shrink-0 tabular-nums text-md-sys-on-surface-variant">
          {count}/{target}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-md-sys-surface-container-high/80">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ContentStudioPanel() {
  return (
    <div className="flex h-full min-h-0 gap-2">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-md-sys-on-surface-variant">Title</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-md-sys-on-surface">SEO Audit Guide 2026</p>
        </div>
        <div className="rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-md-sys-on-surface-variant">Body</p>
          <div className="mt-1 space-y-1">
            <span className="block h-1.5 w-full rounded-full bg-md-sys-surface-container-high/80" />
            <span className="block h-1.5 w-[92%] rounded-full bg-md-sys-surface-container-high/80" />
            <span className="block h-1.5 w-[78%] rounded-full bg-md-sys-primary/40" />
            <span className="block h-1.5 w-[85%] rounded-full bg-md-sys-surface-container-high/80" />
          </div>
        </div>
      </div>
      <aside className="w-[38%] shrink-0 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/50 p-2.5">
        <p className="text-[8px] font-semibold uppercase tracking-wide text-md-sys-on-surface-variant">SEO grade</p>
        <p className="mt-0.5 text-lg font-bold text-md-sys-success">B+</p>
        <p className="mt-2 text-[8px] font-semibold uppercase tracking-wide text-md-sys-on-surface-variant">Terms</p>
        <div className="mt-1.5 space-y-2">
          <MockTermRow term="seo audit" count={4} target={3} tone="ok" />
          <MockTermRow term="site audit" count={1} target={2} tone="warn" />
          <MockTermRow term="crawl budget" count={0} target={1} tone="bad" />
        </div>
      </aside>
    </div>
  );
}

function AiChatPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-xs border border-md-sys-primary/30 bg-md-sys-primary/15 px-2.5 py-1.5">
        <p className="text-[9px] text-md-sys-on-surface">Summarize site health and export a PDF report.</p>
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-tl-xs border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/50 px-2.5 py-1.5">
        <p className="text-[9px] text-md-sys-on-surface-variant">Health score 82 (+4). 12 critical issues remain…</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <CompactKpi label="Health" value="82" accent />
          <CompactKpi label="Issues" value="89" delta="-11" />
          <CompactKpi label="URLs" value="1.2k" />
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        <span className="rounded-full border border-md-sys-primary/30 bg-md-sys-primary/10 px-2.5 py-0.5 text-[8px] font-medium text-md-sys-primary">
          Download PDF
        </span>
        <span className="rounded-full border border-md-sys-outline-variant/40 px-2.5 py-0.5 text-[8px] text-md-sys-on-surface-variant">
          View issues table
        </span>
      </div>
    </div>
  );
}

function PromptGeneratorPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold text-md-sys-on-surface">Issues</p>
        <span className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/60 px-2 py-0.5 text-[8px] font-semibold text-md-sys-primary">
          Generate prompt
        </span>
      </div>
      <div className="rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-lowest/50 p-2">
        <p className="text-[8px] font-semibold text-md-sys-on-surface">Audit issues prompt</p>
        <p className="mt-0.5 text-[7px] text-md-sys-on-surface-variant">31 unique issues from 47 findings</p>
        <div className="mt-2 space-y-1 rounded-md border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/40 p-1.5">
          <span className="block h-1 w-[95%] rounded bg-md-sys-surface-container-high/80" />
          <span className="block h-1 w-[88%] rounded bg-md-sys-surface-container-high/80" />
          <span className="block h-1 w-[72%] rounded bg-md-sys-primary/30" />
          <span className="block h-1 w-[90%] rounded bg-md-sys-surface-container-high/80" />
          <span className="block h-1 w-[65%] rounded bg-md-sys-surface-container-high/80" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded-full border border-md-sys-outline-variant/40 px-1.5 py-0.5 text-[7px] text-md-sys-on-surface">Copy prompt</span>
          <span className="rounded-full border border-md-sys-tertiary/30 bg-md-sys-tertiary-container/20 px-1.5 py-0.5 text-[7px] text-md-sys-tertiary font-medium">
            Get AI plan
          </span>
          <span className="rounded-full border border-md-sys-outline-variant/40 px-1.5 py-0.5 text-[7px] text-md-sys-on-surface">Open in Chat</span>
        </div>
      </div>
      <CompactWidget title="Also on Security & JS errors" className="mb-0 mt-auto">
        <div className="space-y-1">
          <MockIssueRow severity="High" title="Missing HSTS header (12 URLs)" />
          <MockIssueRow severity="Medium" title="TypeError: x is not a function (3 URLs)" />
        </div>
      </CompactWidget>
    </div>
  );
}

function CompareExportPanel() {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <CompactKpi label="Health" value="82" delta="+4" accent />
        <CompactKpi label="Issues" value="89" delta="-11" />
        <CompactKpi label="URLs" value="1,247" delta="+38" />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <CompactWidget title="Category deltas">
          <CompactHorizontalBars
            items={[
              { label: 'On-page', value: 8, color: 'rgb(52 211 153 / 0.85)' },
              { label: 'Perf', value: 5, color: 'rgb(52 211 153 / 0.7)' },
              { label: 'Security', value: -2, color: 'rgb(248 113 113 / 0.85)' },
              { label: 'Index', value: 3, color: 'rgb(59 130 246 / 0.7)' },
            ]}
          />
        </CompactWidget>
        <CompactWidget title="Issue diff">
          <CompactStackedBar
            segments={[
              { label: 'Fixed', value: 24, color: 'rgb(52 211 153 / 0.9)' },
              { label: 'New', value: 8, color: 'rgb(251 191 36 / 0.9)' },
              { label: 'Open', value: 57, color: 'rgb(100 116 139 / 0.6)' },
            ]}
          />
        </CompactWidget>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-md-sys-primary/30 bg-md-sys-primary/10 px-3 py-1 text-[9px] font-semibold text-md-sys-primary">
          Export PDF
        </span>
        <span className="rounded-full border border-md-sys-outline-variant/40 px-3 py-1 text-[9px] font-semibold text-md-sys-on-surface">
          Export HTML
        </span>
      </div>
    </>
  );
}

function renderPanel(variant: LandingProductMockVariant) {
  switch (variant) {
    case 'crawl':
      return <CrawlPanel />;
    case 'issues':
      return <IssuesPanel />;
    case 'promptGenerator':
      return <PromptGeneratorPanel />;
    case 'google':
      return <GooglePanel />;
    case 'contentStudio':
      return <ContentStudioPanel />;
    case 'aiChat':
      return <AiChatPanel />;
    case 'compareExport':
      return <CompareExportPanel />;
    default:
      return <OverviewPanel />;
  }
}

export default function LandingProductMock({
  variant = 'default',
  className = '',
  elevated = false,
  compact = false,
  fillHeight = false,
}: LandingProductMockProps) {
  const bodyMinH = fillHeight
    ? 'min-h-0 flex-1'
    : compact
      ? 'min-h-[200px] @sm:min-h-[220px]'
      : 'min-h-[320px] @sm:min-h-[360px]';

  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container/70 ${
        elevated ? 'shadow-[var(--shadow-elevated)]' : 'shadow-[var(--shadow-elevated)]'
      } ${fillHeight ? 'flex h-full min-h-0 flex-col' : ''} ${className}`.trim()}
    >
      <div className={`flex items-center gap-2 border-b border-md-sys-outline-variant/50 bg-md-sys-surface-container-low/90 px-3 ${compact ? 'py-1.5' : 'py-2.5'}`}>
        <span className="flex gap-1.5">
          <span className={`rounded-full bg-md-sys-error ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
          <span className={`rounded-full bg-md-sys-warning ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
          <span className={`rounded-full bg-md-sys-success ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-lowest/60 px-3 py-0.5 text-center text-[9px] text-md-sys-on-surface-variant @sm:text-[10px]">
          https://site-audit.local/{MOCK_PATHS[variant]}
        </span>
      </div>

      <div className={`flex ${bodyMinH}`}>
        <aside className={`hidden shrink-0 border-r border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/60 p-2 @sm:block ${compact ? 'w-20' : 'w-28 p-2.5'}`}>
          <div className={`flex items-center gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
            <span className={`rounded-full bg-md-sys-primary/20 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
            <span className={`rounded-full bg-md-sys-surface-container-high/80 ${compact ? 'h-1.5 w-10' : 'h-2 w-14'}`} />
          </div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ label, activeFor }) => {
              const active = isNavActive(activeFor, variant);
              return (
                <li
                  key={label}
                  className={`rounded-full px-2 py-1 text-[9px] @sm:text-[10px] ${
                    active ? 'bg-md-sys-primary/15 font-semibold text-md-sys-primary' : 'text-md-sys-on-surface-variant'
                  }`}
                >
                  {label}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={`min-w-0 flex-1 overflow-hidden ${compact ? 'p-2' : 'p-3 @sm:p-3.5'}`}>
          {renderPanel(variant)}
        </div>
      </div>
    </div>
  );
}
