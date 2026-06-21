'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import Button from '@/components/Button';
import {
  anchorToSectionId,
  getGuideBySlug,
  sectionIdToAnchor,
  type IntegrationGuideSlug,
} from '@/lib/docs/integrationGuides';
import { format, strings } from '@/lib/strings';

type GuideSection = {
  title: string;
  items: string[];
  linkLabel?: string;
  linkUrl?: string;
};

export interface IntegrationGuidePanelProps {
  slug: IntegrationGuideSlug;
  /** Initial section from server / URL hash. */
  initialSectionId?: string;
}

function getGuideContent(slug: IntegrationGuideSlug) {
  const integrations = strings.views.docs.integrations as Record<
    string,
    {
      title: string;
      subtitle: string;
      note: string;
      doneWhen: string;
      primaryCta?: { label: string; href: string };
      secondaryCta?: { label: string; href: string };
      sections: Record<string, GuideSection>;
    }
  >;
  return integrations[slug];
}

export default function IntegrationGuidePanel({
  slug,
  initialSectionId,
}: IntegrationGuidePanelProps) {
  const d = strings.docs;
  const guide = getGuideBySlug(slug);
  const content = getGuideContent(slug);
  const sectionOrder = guide?.sectionOrder ?? [];
  const sections = content?.sections ?? {};

  const defaultSection =
    initialSectionId && sectionOrder.includes(initialSectionId)
      ? initialSectionId
      : sectionOrder[0] ?? '';

  const [activeId, setActiveId] = useState(defaultSection);

  useEffect(() => {
    if (initialSectionId && sectionOrder.includes(initialSectionId)) {
      setActiveId(initialSectionId);
    }
  }, [initialSectionId, sectionOrder]);

  useEffect(() => {
    const syncFromHash = () => {
      const anchor = window.location.hash.replace(/^#/, '');
      if (!anchor) return;
      const id = anchorToSectionId(anchor, sectionOrder);
      if (id) setActiveId(id);
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [sectionOrder]);

  const selectSection = useCallback((id: string) => {
    setActiveId(id);
    const anchor = sectionIdToAnchor(id);
    window.history.replaceState(null, '', `#${anchor}`);
  }, []);

  const active = sections[activeId];
  const activeIndex = sectionOrder.indexOf(activeId);

  if (!content || !guide) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground">Guide not found.</p>
    );
  }

  const primaryCta = content.primaryCta ?? { label: d.openIntegrations, href: '/pipeline?integrations=open' };
  const secondaryCta = content.secondaryCta ?? { label: d.openSecrets, href: '/secrets' };
  const secondaryExternal = secondaryCta.href.startsWith('http');

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-6">
        <nav
          aria-label={d.sectionsLabel}
          className="flex shrink-0 flex-col gap-0.5 overflow-y-auto sm:w-56 lg:w-72 xl:w-80"
        >
          {sectionOrder.map((id, index) => {
            const section = sections[id];
            if (!section) return null;
            const selected = activeId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                id={sectionIdToAnchor(id)}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-colors sm:text-sm ${
                  selected
                    ? 'bg-brand-700/60 text-foreground'
                    : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
                }`}
              >
                <span className="font-medium text-link">{index + 1}.</span> {section.title}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          {active ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-4 rounded-2xl border border-muted/30 bg-[var(--chat-surface)] p-5 sm:p-6">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {format(d.stepOf, {
                    current: activeIndex + 1,
                    total: sectionOrder.length,
                  })}
                </p>
                <h2 className="mt-1 text-base font-semibold text-bright sm:text-lg">
                  {active.title}
                </h2>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {active.items.map((item) => (
                  <li key={item} className="pl-1">
                    {item}
                  </li>
                ))}
              </ol>
              {active.linkLabel && active.linkUrl ? (
                <a
                  href={active.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                >
                  {active.linkLabel}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}

          <p className="shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-950 dark:text-amber-100/90">
            {content.note}
          </p>

          <div className="shrink-0 rounded-2xl border border-muted/30 bg-[var(--chat-surface)] px-4 py-3 text-sm">
            <span className="font-medium text-bright">{d.doneWhenLabel}: </span>
            <span className="text-muted-foreground">{content.doneWhen}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-muted/30 bg-[var(--chat-bg)] px-4 py-3 sm:px-6">
        <Link href={primaryCta.href}>
          <Button variant="primary" className="px-4 py-2 text-sm">
            {primaryCta.label}
          </Button>
        </Link>
        {secondaryExternal ? (
          <a href={secondaryCta.href} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" className="px-4 py-2 text-sm">
              {secondaryCta.label}
            </Button>
          </a>
        ) : (
          <Link href={secondaryCta.href}>
            <Button variant="secondary" className="px-4 py-2 text-sm">
              {secondaryCta.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
