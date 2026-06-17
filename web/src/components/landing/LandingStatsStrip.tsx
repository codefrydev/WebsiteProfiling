'use client';

import { Bot, ExternalLink, GitBranch, Shield, Sparkles } from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const STATS = [
  { icon: Shield, label: vl.stat1Label, value: vl.stat1Value, hint: vl.stat1Hint },
  { icon: GitBranch, label: vl.stat2Label, value: vl.stat2Value, hint: vl.stat2Hint },
  { icon: Sparkles, label: vl.stat3Label, value: vl.stat3Value, hint: vl.stat3Hint },
  { icon: Bot, label: vl.stat4Label, value: vl.stat4Value, hint: vl.stat4Hint },
] as const;

const STACK = [vl.trustStackDocker, vl.trustStackPostgres, vl.trustStackNext, vl.trustLicense] as const;

export default function LandingStatsStrip() {
  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center gap-6 lg:gap-8`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} ${landingGutterClass} md:pr-6 lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.statsEyebrow}
            title={vl.statsTitle}
            subtitle={vl.statsSubtitle}
            centered={false}
            compact
          />
        </div>

        <div className={`flex min-h-0 flex-col justify-center px-5 sm:px-8 md:px-6 lg:px-10`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STATS.map(({ icon: Icon, label, value, hint }) => (
              <article
                key={label}
                className="flex min-h-[7.5rem] flex-col rounded-xl border border-default/60 px-4 py-4 transition-colors hover:border-blue-500/25 sm:min-h-[8.25rem] sm:px-5 sm:py-5"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-link">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                  {label}
                </p>
                <p className="mt-0.5 text-base font-bold leading-snug text-foreground sm:text-lg">{value}</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{hint}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`flex flex-col items-center gap-3 border-t border-muted/40 pt-5 sm:flex-row sm:justify-between ${landingGutterClass}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-link">{vl.trustTitle}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STACK.map((item) => (
            <span
              key={item}
              className="rounded-full border border-default/60 px-3 py-1 text-xs font-medium text-foreground"
            >
              {item}
            </span>
          ))}
          <a
            href={vl.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-link transition-colors hover:bg-blue-500/20"
          >
            {vl.trustGithub}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
