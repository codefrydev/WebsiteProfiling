'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import DocsShell from '@/components/docs/DocsShell';
import { INTEGRATION_GUIDES } from '@/lib/docs/integrationGuides';
import { strings } from '@/lib/strings';

export default function DocsHome() {
  const d = strings.docs;
  const guideCards = strings.views.docs.integrations as Record<
    string,
    { cardTitle: string; cardDescription: string }
  >;

  return (
    <DocsShell headerTitle={d.indexTitle} headerSubtitle={d.indexSubtitle}>
      <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {INTEGRATION_GUIDES.map(({ slug }) => {
            const card = guideCards[slug];
            if (!card) return null;
            return (
              <Link
                key={slug}
                href={`/docs/integrations/${slug}`}
                className="group flex items-start justify-between gap-3 rounded-2xl border border-muted/30 bg-[var(--chat-surface)] p-4 transition-colors hover:border-blue-500/30 hover:bg-[var(--chat-surface-hover)]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-bright group-hover:text-link">
                    {card.cardTitle}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.cardDescription}</p>
                </div>
                <ChevronRight
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-link"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </div>
    </DocsShell>
  );
}
