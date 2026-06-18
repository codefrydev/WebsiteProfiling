'use client';

import { ExternalLink } from 'lucide-react';
import LandingCodeBlock from '@/components/landing/LandingCodeBlock';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const QUICK_START_BULLETS = [
  vl.quickStartBulletDocker,
  vl.quickStartBulletLocal,
  vl.quickStartBulletDocs,
] as const;

export default function LandingQuickStart() {
  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center ${landingGutterClass}`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} max-w-md @md:pr-8 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.sectionGettingStarted}
            title={vl.quickStartTitle}
            subtitle={vl.quickStartSubtitle}
            centered={false}
            compact
          />

          <ul className="mt-6 divide-y divide-default/60 overflow-hidden rounded-xl border border-default/60">
            {QUICK_START_BULLETS.map((bullet) => (
              <li key={bullet} className="px-4 py-3.5 text-sm leading-relaxed text-muted-foreground @sm:px-5 @sm:py-4">
                {bullet}
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground @sm:text-sm">{vl.quickStartDocsHint}</p>
            <a
              href={vl.githubReadmeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-link transition-colors hover:underline @sm:text-sm"
            >
              {vl.limitationsReadmeLink}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-center @md:pl-2 @lg:pl-4">
          <div className="flex flex-col gap-3">
            <LandingCodeBlock
              prominent
              label={vl.quickStartDockerLabel}
              command={vl.quickStartDockerCommand}
            />
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
  );
}
