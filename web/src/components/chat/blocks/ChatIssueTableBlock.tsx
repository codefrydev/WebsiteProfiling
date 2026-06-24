
import Badge from '@/components/Badge';
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { formatChatUrlDisplay } from '@/lib/formatChatUrl';
import { strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'issue_table' }>;
const cb = strings.components.chat.blocks;

const DISPLAY_LIMIT = 15;

export default function ChatIssueTableBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const shown = block.issues.slice(0, DISPLAY_LIMIT);
  const remaining = (block.total ?? block.issues.length) - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-default bg-[var(--chat-bg)]/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead>
            <tr className="border-b border-muted/50 text-muted-foreground">
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Issue</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((issue, i) => (
              <tr key={`${issue.url}-${i}`} className="border-b border-muted/30 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge value={issue.priority} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{issue.category || '—'}</td>
                <td className="max-w-[12rem] px-3 py-2 font-mono text-xs">
                  {issue.url ? (
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-link hover:underline"
                      title={issue.url}
                    >
                      {formatChatUrlDisplay(issue.url)}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="max-w-[16rem] break-words px-3 py-2 text-foreground">
                  {issue.message || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining > 0 || block.truncated ? (
        <div className="flex items-center justify-between gap-2 border-t border-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {remaining > 0 ? `${remaining} more issues not shown` : 'Results truncated'}
          </span>
          <button
            type="button"
            className="shrink-0 text-link hover:underline"
            onClick={() => suggestFollowUp(cb.showAllIssues)}
          >
            {cb.showAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
