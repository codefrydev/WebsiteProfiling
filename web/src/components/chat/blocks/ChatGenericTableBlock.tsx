
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { format, strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'generic_table' }>;
const cb = strings.components.chat.blocks;

const DISPLAY_LIMIT = 15;

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export default function ChatGenericTableBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const shown = block.rows.slice(0, DISPLAY_LIMIT);
  const remaining = (block.total ?? block.rows.length) - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-default bg-[var(--chat-bg)]/60">
      <p className="border-b border-muted/30 px-3 py-2 text-sm font-medium text-bright">{block.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead>
            <tr className="border-b border-muted/50 text-muted-foreground">
              {block.columns.map((col) => (
                <th key={col} className="px-3 py-2 font-medium capitalize">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-b border-muted/30 align-top">
                {block.columns.map((col) => (
                  <td key={col} className="max-w-[16rem] break-words px-3 py-2 text-foreground">
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining > 0 || block.truncated ? (
        <div className="flex items-center justify-between gap-2 border-t border-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>{remaining > 0 ? `${remaining} more rows not shown` : 'Results truncated'}</span>
          <button
            type="button"
            className="shrink-0 text-link hover:underline"
            onClick={() => suggestFollowUp(format(cb.askGenericShowAll, { title: block.title }))}
          >
            {cb.showAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
