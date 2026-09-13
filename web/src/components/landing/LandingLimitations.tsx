
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingLimitations() {
  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 @lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} @md:pr-6 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.limitationsEyebrow}
            title={vl.limitationsTitle}
            subtitle={vl.limitationsSubtitle}
            centered={false}
            compact
          />
          <p className="mt-5 hidden text-sm leading-relaxed text-md-sys-on-surface-variant @md:block">
            {vl.limitationsContext}
          </p>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-5 @sm:px-8 @md:px-6 @lg:px-10">
          <div className="grid gap-3 @sm:grid-cols-2 @sm:gap-4">
            <article className="flex min-h-[16rem] flex-col rounded-xl border border-md-sys-outline-variant/40 px-4 py-4 @sm:min-h-[18rem] @sm:px-5 @sm:py-5">
              <h3 className="text-base font-bold text-md-sys-on-surface @sm:text-lg">{vl.limitationsIsTitle}</h3>
              <ul className="mt-4 flex flex-1 flex-col gap-3">
                {vl.limitationsIsItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-md-sys-on-surface-variant @sm:text-base">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-md-sys-success" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="flex min-h-[16rem] flex-col rounded-xl border border-md-sys-outline-variant/40 px-4 py-4 @sm:min-h-[18rem] @sm:px-5 @sm:py-5">
              <h3 className="text-base font-bold text-md-sys-on-surface @sm:text-lg">{vl.limitationsIsntTitle}</h3>
              <ul className="mt-4 flex flex-1 flex-col gap-3">
                {vl.limitationsIsntItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-md-sys-on-surface-variant @sm:text-base">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-md-sys-on-surface-variant/70" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </div>

      <div className={`flex justify-center border-t border-md-sys-outline-variant/40 pt-5 ${landingGutterClass}`}>
        <a
          href={vl.githubReadmeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-md-sys-primary/30 bg-md-sys-primary-container/20 px-4 py-1.5 text-xs font-medium text-md-sys-primary transition-colors hover:bg-md-sys-primary-container/30 @sm:text-sm"
        >
          {vl.limitationsReadmeLink}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
