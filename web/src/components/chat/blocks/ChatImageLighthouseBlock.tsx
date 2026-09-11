
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { formatChatUrlDisplay } from '@/lib/formatChatUrl';
import { strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'image_lighthouse_list' }>;
const ib = strings.components.chat.blocks.imageAudit;

export default function ChatImageLighthouseBlock({ block }: { block: Block }) {
  return (
    <div className="overflow-hidden rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface/60">
      <p className="border-b border-md-sys-outline-variant/30 px-3 py-2 text-xs font-medium text-md-sys-on-surface">
        {ib.lighthouseTitle}
      </p>
      <ul className="divide-y divide-md-sys-outline-variant/30">
        {block.items.map((item, i) => (
          <li key={`${item.auditId || item.title}-${i}`} className="px-3 py-2.5 text-xs">
            <p className="font-medium text-md-sys-on-surface">{item.title}</p>
            {item.displayValue ? (
              <p className="mt-0.5 text-md-sys-on-surface-variant">{item.displayValue}</p>
            ) : null}
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-block font-mono text-md-sys-primary hover:underline break-all"
                title={item.url}
              >
                {formatChatUrlDisplay(item.url)}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {block.total > block.items.length ? (
        <p className="border-t border-md-sys-outline-variant/30 px-3 py-2 text-xs text-md-sys-on-surface-variant">
          {block.total - block.items.length} more Lighthouse image findings
        </p>
      ) : null}
    </div>
  );
}
