'use client';

import { Bot, ExternalLink, GitBranch, Shield, Sparkles } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const STATS = [
  { icon: Shield, label: vl.stat1Label, value: vl.stat1Value },
  { icon: GitBranch, label: vl.stat2Label, value: vl.stat2Value },
  { icon: Sparkles, label: vl.stat3Label, value: vl.stat3Value },
  { icon: Bot, label: vl.stat4Label, value: vl.stat4Value },
] as const;

const STACK = [vl.trustStackDocker, vl.trustStackPostgres, vl.trustStackNext, vl.trustLicense] as const;

export default function LandingStatsStrip() {
  return (
    <section className="border-y border-muted/60 bg-brand-800/25 py-10 sm:py-12">
      <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {vl.statsTitle}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-default bg-brand-800/50 px-4 py-4 text-center transition-colors hover:border-blue-500/25 sm:px-5 sm:py-5"
            >
              <span className="mx-auto mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Icon className="h-4 w-4 text-link" aria-hidden />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                {label}
              </p>
              <p className="mt-1 text-base font-bold leading-snug text-foreground sm:text-lg">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-muted/50 pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{vl.trustTitle}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {STACK.map((item) => (
              <span
                key={item}
                className="rounded-full border border-default bg-brand-800/50 px-3 py-1 text-xs font-medium text-foreground"
              >
                {item}
              </span>
            ))}
            <a
              href={vl.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-link transition-colors hover:bg-blue-500/20"
            >
              {vl.trustGithub}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
