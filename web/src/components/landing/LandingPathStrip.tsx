'use client';

import { BarChart2, ChevronRight, Download, Play, Settings2 } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
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
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} md:pr-6 lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.pathEyebrow}
            title={vl.pathTitle}
            subtitle={vl.pathSubtitle}
            centered={false}
            compact
          />
          <ol className="mt-5 hidden space-y-2 md:block">
            {STEPS.map(({ step, id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-brand-800/60"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-xs font-bold text-link">
                    {step}
                  </span>
                  <span className="font-medium text-foreground group-hover:text-link">{label}</span>
                  <ChevronRight
                    className="ml-auto h-3.5 w-3.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-5 sm:px-8 md:px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STEPS.map(({ step, id, icon: Icon, label, hint }) => (
              <a
                key={id}
                href={`#${id}`}
                className="group flex min-h-[7.5rem] flex-col rounded-xl border border-default/60 px-4 py-4 transition-colors hover:border-blue-500/25 sm:min-h-[8.25rem] sm:px-5 sm:py-5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-link">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-default/60 text-xs font-bold text-link">
                    {step}
                  </span>
                </span>
                <p className="mt-3 text-base font-bold leading-snug text-foreground group-hover:text-link sm:text-lg">
                  {label}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{hint}</p>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex justify-center border-t border-muted/40 pt-5 ${landingGutterClass}`}>
        <a
          href="#quick-start"
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-link transition-colors hover:bg-blue-500/20 sm:text-sm"
        >
          {vl.pathCtaLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
