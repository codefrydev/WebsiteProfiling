'use client';

import { ArrowRight, BarChart2, Download, Play, Settings2 } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const STEPS = [
  { step: 1, id: 'quick-start', icon: Download, label: vl.pathStepInstall, hint: vl.pathStepInstallHint },
  { step: 2, id: 'spotlights', icon: Play, label: vl.pathStepCrawl, hint: vl.pathStepCrawlHint },
  { step: 3, id: 'google-setup', icon: Settings2, label: vl.pathStepGoogle, hint: vl.pathStepGoogleHint },
  { step: 4, id: 'features', icon: BarChart2, label: vl.pathStepReport, hint: vl.pathStepReportHint },
] as const;

export default function LandingPathStrip() {
  return (
    <section
      id="get-started"
      className="scroll-mt-24 mx-auto max-w-6xl px-[var(--spacing-page-x)] pb-10 sm:px-6 lg:px-8"
    >
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {vl.pathTitle}
      </p>
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div
          aria-hidden
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-8 hidden h-px bg-gradient-to-r from-transparent via-blue-500/25 to-transparent sm:block"
        />
        {STEPS.map(({ step, id, icon: Icon, label, hint }, index) => (
          <div key={id} className="relative flex min-w-0 flex-1 items-center gap-2 sm:flex-col sm:gap-0">
            <a
              href={`#${id}`}
              className="group relative z-10 flex min-w-0 flex-1 flex-col items-start gap-3 rounded-2xl border border-default bg-brand-800/50 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-blue-500/35 hover:bg-brand-800/80 hover:shadow-[var(--shadow-elevated)] sm:w-full"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-link">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-[11px] font-bold text-link">
                  {step}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground group-hover:text-link">{label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
              </span>
            </a>
            {index < STEPS.length - 1 ? (
              <ArrowRight
                className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground/50 sm:absolute sm:-right-3 sm:top-1/2 sm:z-20 sm:mx-0 sm:-translate-y-1/2 sm:rotate-0"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
