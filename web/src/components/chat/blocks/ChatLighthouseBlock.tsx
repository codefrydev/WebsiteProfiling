
import { LighthouseScoreGrid } from '@/components/charts';
import { strings } from '@/lib/strings';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

type Block = Extract<ChatBlock, { type: 'lighthouse_scores' }>;
const cb = strings.components.chat.blocks;
const lhLabels = strings.lighthouse.categoryLabels as Record<string, string>;

export default function ChatLighthouseBlock({ block }: { block: Block }) {
  const ariaParts = Object.entries(block.scores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${lhLabels[k] || k}: ${v}`);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <p className="mb-3 text-sm font-medium text-bright">{cb.lighthouseScores}</p>
      <LighthouseScoreGrid
        scores={block.scores}
        categoryLabels={lhLabels}
        aria={ariaParts.join(', ')}
      />
      {block.poorPages.length > 0 ? (
        <div className="mt-4 border-t border-muted/30 pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{cb.poorPerformance}</p>
          <ul className="space-y-1 text-xs">
            {block.poorPages.map((p) => (
              <li key={p.url} className="flex justify-between gap-2">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-link hover:underline"
                  title={p.url}
                >
                  {p.url}
                </a>
                <span className="shrink-0 tabular-nums text-muted-foreground">{p.performance}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
