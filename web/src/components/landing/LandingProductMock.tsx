'use client';

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

export type LandingProductMockVariant = 'default' | 'crawl' | 'issues';

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
  { label: 'Issues', activeFor: ['issues'] as const },
  { label: 'All URLs', activeFor: ['crawl'] as const },
  { label: 'Search', activeFor: [] as const },
  { label: 'Export', activeFor: [] as const },
];

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
          className="text-link"
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
      <div className="mt-1 flex justify-between text-[8px] text-muted-foreground">
        <span>Week 1</span>
        <span>Week 4</span>
      </div>
    </CompactWidget>
  );
}

const SCORE_RING_STROKE: Record<string, string> = {
  'text-link': 'stroke-blue-400',
  'text-amber-400': 'stroke-amber-400',
  'text-emerald-400': 'stroke-emerald-400',
};

function MockScoreRing({
  score,
  label,
  color = 'text-link',
}: {
  score: number;
  label: string;
  color?: string;
}) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;
  const strokeClass = SCORE_RING_STROKE[color] ?? SCORE_RING_STROKE['text-link'];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r="18" fill="none" className="stroke-brand-700/80" strokeWidth="4" />
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
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-bright">
          {score}
        </span>
      </div>
      <span className="mt-1 text-[8px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function MockIssueRow({ severity, title }: { severity: string; title: string }) {
  const severityClass =
    severity === 'Critical'
      ? 'bg-red-500/20 text-red-400'
      : severity === 'High'
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-blue-500/15 text-link';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-default/50 bg-brand-900/30 px-2 py-1.5">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${severityClass}`}>
        {severity}
      </span>
      <span className="min-w-0 truncate text-[10px] text-foreground">{title}</span>
    </div>
  );
}

function MockUrlRow({ path, status }: { path: string; status: number }) {
  const statusClass = status >= 400 ? 'text-red-400' : status >= 300 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-default/50 bg-brand-900/30 px-2 py-1.5">
      <span className={`shrink-0 text-[9px] font-mono font-semibold tabular-nums ${statusClass}`}>{status}</span>
      <span className="min-w-0 truncate text-[10px] text-muted-foreground">{path}</span>
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
        <div className="flex items-center justify-center rounded-lg border border-default/60 bg-brand-900/40 px-2">
          <MockScoreRing score={78} label="Health" color="text-link" />
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
          <p className="mt-1 text-[8px] text-emerald-400">↓ 18% vs last crawl</p>
        </CompactWidget>
      </div>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5 rounded-lg border border-default/60 bg-brand-900/40 p-2">
        <MockScoreRing score={72} label="Perf" color="text-amber-400" />
        <MockScoreRing score={91} label="SEO" color="text-emerald-400" />
        <MockScoreRing score={88} label="A11y" color="text-link" />
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
            <MockScoreRing score={84} label="Perf" color="text-emerald-400" />
            <MockScoreRing score={96} label="SEO" color="text-link" />
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
      ? 'min-h-[200px] sm:min-h-[220px]'
      : 'min-h-[320px] sm:min-h-[360px]';

  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-2xl border border-default bg-brand-800/70 ${
        elevated ? 'shadow-[var(--shadow-elevated)]' : 'shadow-[var(--shadow-elevated)]'
      } ${fillHeight ? 'flex h-full min-h-0 flex-col' : ''} ${className}`.trim()}
    >
      <div className={`flex items-center gap-2 border-b border-default/80 bg-brand-900/90 px-3 ${compact ? 'py-1.5' : 'py-2.5'}`}>
        <span className="flex gap-1.5">
          <span className={`rounded-full bg-red-500/80 ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
          <span className={`rounded-full bg-amber-500/80 ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
          <span className={`rounded-full bg-emerald-500/80 ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md border border-default/60 bg-brand-950/60 px-2 py-0.5 text-center text-[9px] text-muted-foreground sm:text-[10px]">
          https://site-audit.local/{variant === 'crawl' ? 'links' : variant === 'issues' ? 'issues' : 'overview'}
        </span>
      </div>

      <div className={`flex ${bodyMinH}`}>
        <aside className={`hidden shrink-0 border-r border-default/60 bg-brand-900/60 p-2 sm:block ${compact ? 'w-20' : 'w-28 p-2.5'}`}>
          <div className={`flex items-center gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
            <span className={`rounded-md bg-blue-500/20 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
            <span className={`rounded bg-brand-700/80 ${compact ? 'h-1.5 w-10' : 'h-2 w-14'}`} />
          </div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ label, activeFor }) => {
              const active = isNavActive(activeFor, variant);
              return (
                <li
                  key={label}
                  className={`rounded-md px-1.5 py-1 text-[9px] sm:text-[10px] ${
                    active ? 'bg-blue-500/15 font-semibold text-link' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={`min-w-0 flex-1 overflow-hidden ${compact ? 'p-2' : 'p-3 sm:p-3.5'}`}>
          {variant === 'crawl' ? <CrawlPanel /> : variant === 'issues' ? <IssuesPanel /> : <OverviewPanel />}
        </div>
      </div>
    </div>
  );
}
