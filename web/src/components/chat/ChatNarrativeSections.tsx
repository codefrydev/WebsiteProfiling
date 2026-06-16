'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb, ListChecks } from 'lucide-react';
import { isExpandedSectionTitle } from '@/components/chat/chatSectionTitles';
import type { ChatNarrative } from '@/types/chatNarrative';
import { strings, format } from '@/lib/strings';

const c = strings.components.chat;

const SECTIONS: Array<{
  key: keyof ChatNarrative;
  title: string;
  ordered?: boolean;
  icon: typeof Lightbulb;
}> = [
  { key: 'power_insights', title: 'Power Insights', icon: Lightbulb },
  { key: 'recommended_actions', title: 'Recommended actions', ordered: true, icon: ListChecks },
];

export interface ChatNarrativeSectionsProps {
  narrative: ChatNarrative;
  streaming?: boolean;
}

function NarrativeList({
  items,
  ordered,
  streaming,
}: {
  items: string[];
  ordered?: boolean;
  streaming?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 5);
  const Tag = ordered ? 'ol' : 'ul';
  const listClass = ordered
    ? 'list-decimal space-y-1.5 pl-5 text-muted-foreground'
    : 'list-disc space-y-1.5 pl-5 text-muted-foreground';

  return (
    <div className={streaming ? 'animate-pulse' : undefined}>
      <Tag className={listClass}>
        {visible.map((item, i) => (
          <li key={`${i}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </Tag>
      {items.length > 5 && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-link hover:underline"
        >
          {format(c.showAllItems, { count: items.length })}
        </button>
      ) : null}
    </div>
  );
}

export default function ChatNarrativeSections({
  narrative,
  streaming,
}: ChatNarrativeSectionsProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const isOpen = (title: string) => {
    if (title in open) return open[title];
    return isExpandedSectionTitle(title);
  };

  const toggle = (title: string) => {
    setOpen((prev) => ({ ...prev, [title]: !isOpen(title) }));
  };

  const sections = SECTIONS.filter((s) => narrative[s.key].length > 0);
  if (!sections.length) return null;

  return (
    <div className="chat-insight-sections space-y-2">
      {sections.map((section) => {
        const expanded = isOpen(section.title);
        const Icon = section.icon;
        return (
          <section
            key={section.key}
            className="chat-insight-section overflow-hidden rounded-lg border border-default/60 bg-[var(--chat-bg)]/30"
          >
            <button
              type="button"
              onClick={() => toggle(section.title)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-bright hover:bg-[var(--chat-surface-hover)]"
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Icon className="h-3.5 w-3.5 shrink-0 text-amber-400/80" aria-hidden />
              <span>{section.title}</span>
            </button>
            {expanded ? (
              <div className="border-t border-default/40 px-3 py-2">
                <NarrativeList
                  items={narrative[section.key]}
                  ordered={section.ordered}
                  streaming={streaming}
                />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
