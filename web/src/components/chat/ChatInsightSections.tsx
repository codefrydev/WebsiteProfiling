
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import { stripEmojiFromTitle } from '@/components/chat/chatSectionTitles';
import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatInsightSection {
  title: string;
  body: string;
}

export interface ChatInsightSectionsProps {
  content: string;
  streaming?: boolean;
}

const SECTION_SPLIT_RE = /^#{3,4}\s+(.+)$/gm;

export function splitInsightSections(content: string): ChatInsightSection[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const matches = [...trimmed.matchAll(SECTION_SPLIT_RE)];
  if (!matches.length) {
    return [{ title: c.insightDefaultTitle, body: trimmed }];
  }

  const sections: ChatInsightSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = stripEmojiFromTitle(match[1] || c.insightDefaultTitle);
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const body = trimmed.slice(start, end).trim();
    if (!body.trim()) continue;
    sections.push({ title: title || c.insightDefaultTitle, body });
  }
  return sections;
}

function SectionBody({ body, streaming }: { body: string; streaming?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const lines = body.split('\n');
  const listLines = lines.filter((l) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l));
  const shouldCollapseList = listLines.length > 5 && !showAll;

  let displayBody = body;
  if (shouldCollapseList) {
    let kept = 0;
    const out: string[] = [];
    for (const line of lines) {
      if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        kept += 1;
        if (kept > 5) continue;
      }
      out.push(line);
    }
    displayBody = out.join('\n').trim();
  }

  return (
    <div>
      <ChatMarkdown content={displayBody} streaming={streaming} nested />
      {shouldCollapseList ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-link hover:underline"
        >
          {format(c.showAllItems, { count: listLines.length })}
        </button>
      ) : null}
    </div>
  );
}

export default function ChatInsightSections({ content, streaming }: ChatInsightSectionsProps) {
  const sections = useMemo(() => splitInsightSections(content), [content]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!sections.length) return null;

  const isOpen = (title: string) => {
    if (title in open) return open[title];
    return true;
  };

  const toggle = (title: string) => {
    setOpen((prev) => ({ ...prev, [title]: !isOpen(title) }));
  };

  if (sections.length === 1 && !sections[0].title) {
    return <ChatMarkdown content={content} streaming={streaming} />;
  }

  return (
    <div className="chat-insight-sections space-y-2">
      {sections.map((section) => {
        const expanded = isOpen(section.title);
        return (
          <section
            key={section.title}
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
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-400/80" aria-hidden />
              <span>{section.title}</span>
            </button>
            {expanded ? (
              <div className="border-t border-default/40 px-3 py-2">
                <SectionBody body={section.body} streaming={streaming} />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
