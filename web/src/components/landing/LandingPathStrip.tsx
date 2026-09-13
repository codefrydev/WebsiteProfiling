
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
  { step: 3, id: 'spotlight-google', icon: Settings2, label: vl.pathStepGoogle, hint: vl.pathStepGoogleHint },
  { step: 4, id: 'spotlight-compare-export', icon: BarChart2, label: vl.pathStepReport, hint: vl.pathStepReportHint },
] as const;

export default function LandingPathStrip() {
  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 @lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} @md:pr-6 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.pathEyebrow}
            title={vl.pathTitle}
            subtitle={vl.pathSubtitle}
            centered={false}
            compact
          />
          <ol className="mt-5 hidden space-y-2 @md:block">
            {STEPS.map(({ step, id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="press group flex items-center gap-3 rounded-full px-4 py-2 text-sm transition-all hover:bg-md-sys-surface-container/80 active:scale-[0.99]"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-md-sys-primary/30 bg-md-sys-primary-container/20 text-xs font-bold text-md-sys-primary">
                    {step}
                  </span>
                  <span className="font-medium text-md-sys-on-surface group-hover:text-md-sys-primary">{label}</span>
                  <ChevronRight
                    className="ml-auto h-3.5 w-3.5 text-md-sys-on-surface-variant/50 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-5 @sm:px-8 @md:px-6 @lg:px-10">
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
            {STEPS.map(({ step, id, icon: Icon, label, hint }) => (
              <a
                key={id}
                href={`#${id}`}
                className="group flex min-h-[7.5rem] flex-col rounded-xl border border-md-sys-outline-variant/40 px-4 py-4 transition-colors hover:border-md-sys-primary/30 @sm:min-h-[8.25rem] @sm:px-5 @sm:py-5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-md-sys-primary/20 bg-md-sys-primary-container/20 text-md-sys-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-md-sys-outline-variant/40 text-xs font-bold text-md-sys-primary">
                    {step}
                  </span>
                </span>
                <p className="mt-3 text-base font-bold leading-snug text-md-sys-on-surface group-hover:text-md-sys-primary @sm:text-lg">
                  {label}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-md-sys-on-surface-variant @sm:text-sm">{hint}</p>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex justify-center border-t border-md-sys-outline-variant/40 pt-5 ${landingGutterClass}`}>
        <a
          href="#quick-start"
          className="inline-flex items-center gap-1.5 rounded-full border border-md-sys-primary/30 bg-md-sys-primary-container/20 px-4 py-1.5 text-xs font-medium text-md-sys-primary transition-colors hover:bg-md-sys-primary-container/35 @sm:text-sm"
        >
          {vl.pathCtaLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
