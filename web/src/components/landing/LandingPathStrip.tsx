'use client';

import { ArrowRight, BarChart2, Download, Play, Settings2 } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const STEPS = [
  { id: 'quick-start', icon: Download, label: vl.pathStepInstall, hint: vl.pathStepInstallHint },
  { id: 'how-it-works', icon: Play, label: vl.pathStepCrawl, hint: vl.pathStepCrawlHint },
  { id: 'google-setup', icon: Settings2, label: vl.pathStepGoogle, hint: vl.pathStepGoogleHint },
  { id: 'features', icon: BarChart2, label: vl.pathStepReport, hint: vl.pathStepReportHint },
] as const;

export default function LandingPathStrip() {
  return (
    <section className="mx-auto max-w-6xl px-[var(--spacing-page-x)] pb-8 sm:px-6 lg:px-8">
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {vl.pathTitle}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
        {STEPS.map(({ id, icon: Icon, label, hint }, index) => (
          <div key={id} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-0">
            <a
              href={`#${id}`}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-default bg-brand-800/50 px-3 py-2.5 transition-colors hover:border-blue-500/35 hover:bg-brand-800/80 sm:flex-col sm:items-start sm:px-4 sm:py-3"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-link sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground group-hover:text-link">
                  {label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
            </a>
            {index < STEPS.length - 1 ? (
              <ArrowRight
                className="mx-1 hidden h-4 w-4 shrink-0 text-muted-foreground/60 sm:mx-2 sm:block"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
