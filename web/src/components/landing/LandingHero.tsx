'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import LandingProductMock from '@/components/landing/LandingProductMock';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingHero() {
  return (
    <section className="mx-auto max-w-6xl px-[var(--spacing-page-x)] pb-12 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-16 lg:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-link">{vl.heroEyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
            {vl.heroTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{vl.heroSubtitle}</p>
          <ul className="mt-5 space-y-2.5">
            {vl.heroBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-link" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-sm font-semibold text-link transition-colors hover:underline"
            >
              {vl.ctaRunAudit}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/home"
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              {vl.ctaDashboard}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="landing-mock-glow landing-float rounded-2xl">
          <LandingProductMock variant="default" className="w-full" elevated />
        </div>
      </div>
    </section>
  );
}
