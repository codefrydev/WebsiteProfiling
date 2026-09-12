
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import LandingProductMock from '@/components/landing/LandingProductMock';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
  landingSplitMockClass,
  landingSplitVisualClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingFinalCta() {
  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 @lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} @md:pr-6 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.finalCtaEyebrow}
            title={vl.finalCtaTitle}
            subtitle={vl.finalCtaSubtitle}
            centered={false}
            compact
          />
          <ul className="mt-5 space-y-2">
            {vl.finalCtaBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm text-md-sys-on-surface-variant @sm:text-base">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-md-sys-primary" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/pipeline"
              className="press inline-flex items-center gap-1.5 rounded-full bg-md-sys-primary px-5 py-2.5 text-sm font-semibold text-md-sys-on-primary transition-all duration-200 hover:brightness-105 active:scale-[0.98] @sm:text-base shadow-sm"
            >
              {vl.ctaRunAudit}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/home"
              className="press inline-flex items-center gap-1.5 rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-high/40 px-5 py-2.5 text-sm font-semibold text-md-sys-on-surface transition-all duration-200 hover:bg-md-sys-surface-container-highest active:scale-[0.98] @sm:text-base"
            >
              {vl.ctaDashboard}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-xs text-md-sys-on-surface-variant @sm:text-sm">
            {vl.heroProofNoSubscription} · {vl.heroProofLocalData}
          </p>
        </div>

        <div className={`${landingSplitVisualClass} px-5 @sm:px-8 @md:px-6 @lg:px-10`}>
          <div className={`${landingSplitMockClass} min-h-[14rem] @sm:min-h-[18rem]`}>
            <LandingProductMock variant="compareExport" className="h-full min-h-0 w-full" elevated fillHeight />
          </div>
        </div>
      </div>

      <div className={`flex justify-center border-t border-md-sys-outline-variant/40 pt-5 ${landingGutterClass}`}>
        <a
          href="#quick-start"
          className="inline-flex items-center gap-1.5 rounded-full border border-md-sys-primary/30 bg-md-sys-primary-container/20 px-4 py-1.5 text-xs font-medium text-md-sys-primary transition-colors hover:bg-md-sys-primary-container/30 @sm:text-sm"
        >
          {vl.finalCtaInstallLink}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
