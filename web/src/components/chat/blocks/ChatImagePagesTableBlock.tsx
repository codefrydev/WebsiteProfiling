
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import { formatChatUrlDisplay } from '@/lib/formatChatUrl';
import { format, strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'image_pages_table' }>;
const cb = strings.components.chat.blocks;
const ib = cb.imageAudit;

const DISPLAY_LIMIT = 12;

export default function ChatImagePagesTableBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const shown = block.pages.slice(0, DISPLAY_LIMIT);
  const remaining = (block.total ?? block.pages.length) - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-default bg-[var(--chat-bg)]/60">
      <p className="border-b border-muted/30 px-3 py-2 text-xs font-medium text-bright">
        {block.title}
        {block.total != null ? (
          <span className="ml-2 font-normal text-muted-foreground">({block.total})</span>
        ) : null}
      </p>
      <ul className="divide-y divide-muted/30">
        {shown.map((page) => (
          <li key={page.url} className="px-3 py-2.5 text-xs">
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-link hover:underline break-all"
              title={page.url}
            >
              {formatChatUrlDisplay(page.url)}
            </a>
            {page.title ? (
              <p className="mt-0.5 truncate text-muted-foreground">{page.title}</p>
            ) : null}
            {page.detail ? <p className="mt-0.5 text-muted-foreground">{page.detail}</p> : null}
          </li>
        ))}
      </ul>
      {remaining > 0 || block.truncated ? (
        <div className="flex items-center justify-between gap-2 border-t border-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>{remaining > 0 ? format(ib.morePages, { count: remaining }) : cb.showAll}</span>
          <button
            type="button"
            className="shrink-0 text-link hover:underline"
            onClick={() => suggestFollowUp(format(ib.exportList, { topic: block.title }))}
          >
            {cb.showAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
