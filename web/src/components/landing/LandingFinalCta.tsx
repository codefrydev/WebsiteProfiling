'use client';

import Link from 'next/link';
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
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} md:pr-6 lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.finalCtaEyebrow}
            title={vl.finalCtaTitle}
            subtitle={vl.finalCtaSubtitle}
            centered={false}
            compact
          />
          <ul className="mt-5 space-y-2">
            {vl.finalCtaBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 sm:text-base"
            >
              {vl.ctaRunAudit}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 rounded-lg border border-default px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-brand-800 sm:text-base"
            >
              {vl.ctaDashboard}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
            {vl.heroProofNoSubscription} · {vl.heroProofLocalData}
          </p>
        </div>

        <div className={`${landingSplitVisualClass} px-5 sm:px-8 md:px-6 lg:px-10`}>
          <div className={`${landingSplitMockClass} min-h-[14rem] sm:min-h-[18rem]`}>
            <LandingProductMock variant="issues" className="h-full min-h-0 w-full" elevated fillHeight />
          </div>
        </div>
      </div>

      <div className={`flex justify-center border-t border-muted/40 pt-5 ${landingGutterClass}`}>
        <a
          href="#quick-start"
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-link transition-colors hover:bg-blue-500/20 sm:text-sm"
        >
          {vl.finalCtaInstallLink}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
