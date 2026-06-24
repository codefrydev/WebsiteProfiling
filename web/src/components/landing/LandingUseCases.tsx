
import { Briefcase, Building2, Code2 } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
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
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} max-w-md @md:pr-8 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.useCasesEyebrow}
            title={vl.useCasesTitle}
            subtitle={vl.useCasesSubtitle}
            centered={false}
            compact
          />
        </div>

        <div className="flex min-h-0 flex-col justify-center @md:pl-2 @lg:pl-4">
          <ul className="divide-y divide-default/60 overflow-hidden rounded-xl border border-default/60">
            {USE_CASES.map(({ icon: Icon, title, description }) => (
              <li key={title}>
                <article className="flex gap-4 px-4 py-4 @sm:gap-5 @sm:px-5 @sm:py-5">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-link">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground @sm:text-base">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
