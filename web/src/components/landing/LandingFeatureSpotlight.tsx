'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import LandingProductMock, { type LandingProductMockVariant } from '@/components/landing/LandingProductMock';

interface LandingFeatureSpotlightProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
  mockVariant: LandingProductMockVariant;
  ctaHref: string;
  ctaLabel: string;
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
  reversed = false,
}: LandingFeatureSpotlightProps) {
  const textCol = (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-link">{eyebrow}</p>
      <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
      <ul className="mt-5 space-y-2.5">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2.5 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-link" aria-hidden />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-link transition-colors hover:underline"
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );

  const mockCol = (
    <div className="landing-mock-glow landing-float rounded-2xl">
      <LandingProductMock variant={mockVariant} className="w-full" elevated />
    </div>
  );

  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-14 ${
        reversed ? 'lg:[&>*:first-child]:order-2' : ''
      }`}
    >
      {textCol}
      {mockCol}
    </div>
  );
}
