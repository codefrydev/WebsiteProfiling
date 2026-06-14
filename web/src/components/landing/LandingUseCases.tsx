'use client';

import { Briefcase, Building2, Code2 } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const USE_CASES = [
  {
    icon: Briefcase,
    title: vl.useCase1Title,
    description: vl.useCase1Description,
  },
  {
    icon: Building2,
    title: vl.useCase2Title,
    description: vl.useCase2Description,
  },
  {
    icon: Code2,
    title: vl.useCase3Title,
    description: vl.useCase3Description,
  },
] as const;

export default function LandingUseCases() {
  return (
    <section className="landing-section-alt border-y border-muted/60 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
        <LandingSectionHeader
          eyebrow={vl.useCasesEyebrow}
          title={vl.useCasesTitle}
          subtitle={vl.useCasesSubtitle}
        />
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {USE_CASES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-default bg-brand-800/50 p-5 transition-all hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-[var(--shadow-elevated)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                <Icon className="h-5 w-5 text-link" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
