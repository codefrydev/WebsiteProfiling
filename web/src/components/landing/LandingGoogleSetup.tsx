'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import Button from '@/components/Button';
import { landingContentClass } from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

type GuideSection = {
  title: string;
  items: string[];
  linkLabel?: string;
  linkUrl?: string;
};

const SECTION_ORDER = [
  'prerequisites',
  'gcpProject',
  'enableApis',
  'oauthConsent',
  'oauthClient',
  'serviceAccount',
  'gscProperty',
  'ga4Property',
  'inApp',
] as const;

export default function LandingGoogleSetup() {
  const vl = strings.views.landing;
  const sections = vl.googleSetupSections as Record<string, GuideSection>;
  const [activeId, setActiveId] = useState<string>('oauthClient');
  const active = sections[activeId];

  return (
    <div className={`${landingContentClass} flex h-full flex-col justify-center`}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-link">
            {vl.sectionSetupGuide}
          </p>
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">{vl.googleSetupTitle}</h2>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
            {vl.googleSetupSubtitle}
          </p>
        </div>
        <Link href="/pipeline" className="shrink-0">
          <Button variant="secondary" className="px-3 py-1.5 text-xs sm:text-sm">
            {vl.googleSetupCta}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {SECTION_ORDER.map((id, index) => {
          const section = sections[id];
          if (!section) return null;
          const selected = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveId(id)}
              className={`rounded-lg border px-2 py-1.5 text-left text-[10px] leading-snug transition-colors sm:px-2.5 sm:py-2 sm:text-xs ${
                selected
                  ? 'border-blue-500/40 bg-blue-500/10 text-foreground'
                  : 'border-default/60 text-muted-foreground hover:border-blue-500/25 hover:text-foreground'
              }`}
            >
              <span className="font-bold text-link">{index + 1}.</span> {section.title}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="mt-2.5 rounded-xl border border-default/60 p-3 sm:p-3.5">
          <p className="text-sm font-semibold text-foreground">{active.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {active.items[0]}
          </p>
          {active.linkLabel && active.linkUrl ? (
            <a
              href={active.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline sm:text-sm"
            >
              {active.linkLabel}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2.5 line-clamp-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-950 dark:text-amber-100/90">
        {vl.googleSetupNote}
      </p>
    </div>
  );
}
