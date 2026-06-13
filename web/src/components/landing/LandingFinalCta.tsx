'use client';

import Link from 'next/link';
import Button from '@/components/Button';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingFinalCta() {
  return (
    <section className="border-t border-muted/60 bg-gradient-to-b from-brand-800/30 to-brand-900 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-[var(--spacing-page-x)] text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{vl.finalCtaTitle}</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          {vl.finalCtaSubtitle}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/pipeline">
            <Button variant="primary" className="px-8 py-3 text-base">
              {vl.ctaRunAudit}
            </Button>
          </Link>
          <Link href="/home">
            <Button variant="secondary" className="px-8 py-3 text-base">
              {vl.ctaDashboard}
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          {vl.heroProofNoSubscription} · {vl.heroProofLocalData}
        </p>
      </div>
    </section>
  );
}
