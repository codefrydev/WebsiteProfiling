'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import Button from '@/components/Button';
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
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(['prerequisites', 'oauthClient']));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenIds(new Set(SECTION_ORDER));
  const collapseAll = () => setOpenIds(new Set());

  return (
    <section
      id="google-setup"
      className="scroll-mt-24 border-y border-muted/60 bg-brand-800/20 py-10 sm:py-12"
    >
      <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-link">
            {vl.sectionSetupGuide}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">{vl.googleSetupTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {vl.googleSetupSubtitle}
              </p>
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90">
                {vl.googleSetupNote}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Collapse all
              </button>
              <Link href="/pipeline">
                <Button variant="secondary" className="px-4 py-1.5 text-xs sm:text-sm">
                  {vl.googleSetupCta}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {SECTION_ORDER.map((id, index) => {
            const section = sections[id];
            if (!section) return null;
            const expanded = openIds.has(id);
            const panelId = `google-setup-panel-${id}`;
            return (
              <article
                key={id}
                className="overflow-hidden rounded-xl border border-default bg-brand-800/40"
              >
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-brand-900/30 sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-link">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{section.title}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {expanded ? (
                  <div id={panelId} className="space-y-3 border-t border-muted/60 px-4 py-4 sm:px-5">
                    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                    {section.linkLabel && section.linkUrl ? (
                      <a
                        href={section.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                      >
                        {section.linkLabel}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
