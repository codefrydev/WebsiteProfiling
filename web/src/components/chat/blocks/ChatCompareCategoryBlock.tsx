
import { ScoreDelta } from '@/components/charts/ScoreDelta';
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { format, strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'compare_category_deltas' }>;
const cb = strings.components.chat.blocks;

export default function ChatCompareCategoryBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const maxAbs = Math.max(...block.rows.map((r) => Math.abs(r.delta ?? 0)), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-default bg-[var(--chat-bg)]/60">
      <p className="border-b border-muted/30 px-3 py-2 text-sm font-medium text-bright">
        {cb.categoryCompare}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-left text-xs">
          <thead>
            <tr className="border-b border-muted/50 text-muted-foreground">
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Current</th>
              <th className="px-3 py-2 font-medium">Baseline</th>
              <th className="px-3 py-2 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => {
              const highlight = Math.abs(row.delta ?? 0) === maxAbs && maxAbs > 0;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-muted/30 align-top ${highlight ? 'bg-brand-800/30' : ''}`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left text-link hover:underline"
                      onClick={() =>
                        suggestFollowUp(format(cb.askCategoryDrop, { category: row.name }))
                      }
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.current ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.baseline ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreDelta delta={row.delta ?? null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
