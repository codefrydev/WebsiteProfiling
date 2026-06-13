'use client';

import { ExternalLink } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingLimitations() {
  return (
    <section
      id="limitations"
      className="scroll-mt-24 border-y border-muted/60 bg-brand-800/20 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
        <LandingSectionHeader title={vl.limitationsTitle} subtitle={vl.limitationsSubtitle} />
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="rounded-xl border border-default bg-brand-800/40 p-5">
            <h3 className="text-base font-semibold text-foreground">{vl.limitationsIsTitle}</h3>
            <ul className="mt-3 space-y-2">
              {vl.limitationsIsItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-default bg-brand-800/40 p-5">
            <h3 className="text-base font-semibold text-foreground">{vl.limitationsIsntTitle}</h3>
            <ul className="mt-3 space-y-2">
              {vl.limitationsIsntItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center">
          <a
            href={vl.githubReadmeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
          >
            {vl.limitationsReadmeLink}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      </div>
    </section>
  );
}
