'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import LandingProductMock, { type LandingProductMockVariant } from '@/components/landing/LandingProductMock';
import {
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
  landingSplitMockClass,
  landingSplitVisualClass,
} from '@/components/landing/landingLayout';
import { useInView } from '@/lib/useInView';
import type { CSSProperties } from 'react';

interface LandingFeatureSpotlightProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
  mockVariant: LandingProductMockVariant;
  ctaHref: string;
  ctaLabel: string;
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaExternal?: boolean;
  reversed?: boolean;
}

export default function LandingFeatureSpotlight({
  eyebrow,
  title,
  description,
  bullets,
  mockVariant,
  ctaHref,
  ctaLabel,
  secondaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaExternal = false,
  reversed = false,
}: LandingFeatureSpotlightProps) {
  const { ref: bulletsRef, inView: bulletsInView } = useInView<HTMLUListElement>();

  const copy = (
    <>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-link">{eyebrow}</p>
      <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">{title}</h3>
      <p className="mt-2 text-sm leading-snug text-muted-foreground line-clamp-2 sm:text-base">{description}</p>
      <ul
        ref={bulletsRef}
        className={`mt-3 space-y-1.5${bulletsInView ? ' stagger' : ''}`}
      >
        {bullets.slice(0, 3).map((bullet, index) => (
          <li
            key={bullet}
            className="flex items-start gap-2 text-xs text-foreground sm:text-sm"
            style={{ '--i': index } as CSSProperties}
          >
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden />
            <span className="line-clamp-2">{bullet}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-link transition-colors hover:underline"
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
      {secondaryCtaHref && secondaryCtaLabel ? (
        secondaryCtaExternal ? (
          <a
            href={secondaryCtaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-link hover:underline"
          >
            {secondaryCtaLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : (
          <Link
            href={secondaryCtaHref}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-link hover:underline"
          >
            {secondaryCtaLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )
      ) : null}
    </>
  );

  return (
    <div className={`${landingSectionSplitClass} ${reversed ? 'landing-section-split--reversed' : ''}`}>
      <div
        className={`${landingSplitCopyClass} ${landingGutterClass} md:pr-6 lg:pr-8 ${reversed ? 'md:order-2 md:pl-6 md:pr-5 lg:pl-10' : ''}`}
      >
        {copy}
      </div>
      <div className={`${landingSplitVisualClass} px-5 pb-2 sm:px-8 md:px-0 ${reversed ? 'md:order-1' : ''}`}>
        <div className={landingSplitMockClass}>
          <LandingProductMock
            variant={mockVariant}
            className="h-full min-h-0 w-full"
            elevated
            compact
            fillHeight
          />
        </div>
      </div>
    </div>
  );
}
