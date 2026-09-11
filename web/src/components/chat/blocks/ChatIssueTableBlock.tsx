
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
    <div className="overflow-hidden rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead>
            <tr className="border-b border-md-sys-outline-variant/40 text-md-sys-on-surface-variant">
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Issue</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((issue, i) => (
              <tr key={`${issue.url}-${i}`} className="border-b border-md-sys-outline-variant/30 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge value={issue.priority} />
                </td>
                <td className="px-3 py-2 text-md-sys-on-surface-variant">{issue.category || '—'}</td>
                <td className="max-w-[12rem] px-3 py-2 font-mono text-xs">
                  {issue.url ? (
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-md-sys-primary hover:underline"
                      title={issue.url}
                    >
                      {formatChatUrlDisplay(issue.url)}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="max-w-[16rem] break-words px-3 py-2 text-md-sys-on-surface">
                  {issue.message || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining > 0 || block.truncated ? (
        <div className="flex items-center justify-between gap-2 border-t border-md-sys-outline-variant/30 px-3 py-2 text-xs text-md-sys-on-surface-variant">
          <span>
            {remaining > 0 ? `${remaining} more issues not shown` : 'Results truncated'}
          </span>
          <button
            type="button"
            className="shrink-0 text-md-sys-primary hover:underline"
            onClick={() => suggestFollowUp(cb.showAllIssues)}
          >
            {cb.showAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
