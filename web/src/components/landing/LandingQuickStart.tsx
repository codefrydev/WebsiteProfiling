'use client';

import { CheckCircle2, ExternalLink } from 'lucide-react';
import LandingCodeBlock from '@/components/landing/LandingCodeBlock';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
import { useInView } from '@/lib/useInView';
import { strings } from '@/lib/strings';
import type { CSSProperties } from 'react';

const vl = strings.views.landing;

const QUICK_START_BULLETS = [
  vl.quickStartBulletDocker,
  vl.quickStartBulletLocal,
  vl.quickStartBulletDocs,
] as const;

export default function LandingQuickStart() {
  const { ref: bulletsRef, inView: bulletsInView } = useInView<HTMLUListElement>();

  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} md:pr-6 lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.sectionGettingStarted}
            title={vl.quickStartTitle}
            subtitle={vl.quickStartSubtitle}
            centered={false}
            compact
          />
          <ul
            ref={bulletsRef}
            className={`mt-5 space-y-2${bulletsInView ? ' stagger' : ''}`}
          >
            {QUICK_START_BULLETS.map((bullet, index) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-sm text-muted-foreground"
                style={{ '--i': index } as CSSProperties}
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-5 sm:px-8 md:px-6 lg:px-10">
          <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
            <LandingCodeBlock
              prominent
              label={vl.quickStartDockerLabel}
              command={vl.quickStartDockerCommand}
            />
            <div className="flex flex-col gap-3">
              <LandingCodeBlock
                prominent
                label={vl.quickStartLocalLabel}
                command={vl.quickStartLocalSetup}
              />
              <LandingCodeBlock prominent command={vl.quickStartLocalRun} />
            </div>
          </div>
        </div>
      </div>

      <div className={`border-t border-muted/40 pt-5 text-center ${landingGutterClass}`}>
        <p className="text-xs text-muted-foreground sm:text-sm">{vl.quickStartDocsHint}</p>
        <a
          href={vl.githubReadmeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline sm:text-sm"
        >
          {vl.limitationsReadmeLink}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
