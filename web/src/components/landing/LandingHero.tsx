'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import LandingHeroTopBar from '@/components/landing/LandingHeroTopBar';
import LandingProductMock from '@/components/landing/LandingProductMock';
import LandingScrollCue from '@/components/landing/LandingScrollCue';
import {
  LANDING_SECTION_IDS,
  landingGutterClass,
  landingSectionClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
  landingSplitMockClass,
  landingSplitVisualClass,
} from '@/components/landing/landingLayout';
import { useInView } from '@/lib/useInView';
import { strings } from '@/lib/strings';
import type { CSSProperties } from 'react';

const vl = strings.views.landing;

export default function LandingHero() {
  const { ref: bulletsRef, inView: bulletsInView } = useInView<HTMLUListElement>();

  return (
    <section id={LANDING_SECTION_IDS.hero} className={`${landingSectionClass} !pt-0`}>
      <LandingHeroTopBar />

      <div className={`flex min-h-0 flex-1 flex-col justify-center pb-11 pt-4 sm:pb-12 sm:pt-5 ${landingGutterClass}`}>
        <div className={landingSectionSplitClass}>
          <div className={`${landingSplitCopyClass} md:pr-6 lg:pr-10`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-link">{vl.heroEyebrow}</p>
            <h1 className="landing-gradient-text text-3xl font-bold tracking-tight sm:text-4xl md:text-[2.5rem] md:leading-[1.1] lg:text-[2.75rem] xl:text-5xl">
              {vl.heroTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">
              {vl.heroSubtitle}
            </p>
            <ul
              ref={bulletsRef}
              className={`mt-4 space-y-1.5${bulletsInView ? ' stagger' : ''}`}
            >
              {vl.heroBullets.map((bullet, index) => (
                <li
                  key={bullet}
                  className="flex items-start gap-2 text-sm text-foreground"
                  style={{ '--i': index } as CSSProperties}
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden />
                  <span className="line-clamp-2">{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href="/pipeline"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                {vl.ctaRunAudit}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/home"
                className="inline-flex items-center gap-1.5 rounded-lg border border-default px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-brand-800"
              >
                {vl.ctaDashboard}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground sm:text-xs">
              {vl.heroProofNoSubscription} · {vl.heroProofLocalData}
            </p>
          </div>

          <div className={`${landingSplitVisualClass} px-0 pb-2 sm:px-0 md:px-0`}>
            <div className={landingSplitMockClass}>
              <LandingProductMock variant="default" className="h-full min-h-0 w-full" elevated fillHeight />
            </div>
          </div>
        </div>
      </div>

      <LandingScrollCue href={`#${LANDING_SECTION_IDS.stats}`} label={vl.deckNext} />
    </section>
  );
}
