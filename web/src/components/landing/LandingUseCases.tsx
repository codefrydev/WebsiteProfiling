'use client';

import { Briefcase, Building2, Code2 } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import { landingContentClass } from '@/components/landing/landingLayout';
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
    <div className={landingContentClass}>
      <LandingSectionHeader
        eyebrow={vl.useCasesEyebrow}
        title={vl.useCasesTitle}
        subtitle={vl.useCasesSubtitle}
        compact
      />
      <div className="grid gap-3 md:grid-cols-3">
        {USE_CASES.map(({ icon: Icon, title, description }) => (
          <article
            key={title}
            className="rounded-xl border border-default/60 p-3.5 transition-colors hover:border-blue-500/25 sm:p-4"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center text-link">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
