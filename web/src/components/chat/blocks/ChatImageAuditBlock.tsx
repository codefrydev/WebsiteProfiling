'use client';

import { ImageIcon } from 'lucide-react';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'image_audit_summary' }>;
const ib = strings.components.chat.blocks.imageAudit;

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'neutral';
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-default bg-brand-800/40 text-foreground';

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export default function ChatImageAuditBlock({ block }: { block: Block }) {
  const chartItems = [
    { label: ib.missingAlt, value: block.pagesMissingAlt },
    { label: ib.noLazyLoad, value: block.pagesWithoutLazy },
    { label: ib.missingDimensions, value: block.pagesMissingDimensions },
    { label: ib.lighthouseIssues, value: block.lighthouseImageDiagnostics },
  ].filter((i) => i.value > 0);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-default bg-brand-800/50">
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-bright">{ib.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{ib.subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {block.imagesTotal.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{ib.totalImages}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label={ib.missingAlt}
          value={block.pagesMissingAlt}
          tone={block.pagesMissingAlt > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.noLazyLoad}
          value={block.pagesWithoutLazy}
          tone={block.pagesWithoutLazy > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.missingDimensions}
          value={block.pagesMissingDimensions}
          tone={block.pagesMissingDimensions > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.lighthouseIssues}
          value={block.lighthouseImageDiagnostics}
          tone={block.lighthouseImageDiagnostics > 0 ? 'warn' : 'ok'}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {block.ogCoveragePct != null ? (
          <span>
            {ib.ogCoverage}:{' '}
            <span className="font-medium text-foreground">
              {block.ogCoveragePct % 1 === 0
                ? block.ogCoveragePct
                : block.ogCoveragePct.toFixed(1)}
              %
            </span>
            {block.ogMissingCount != null && block.ogMissingCount > 0
              ? ` · ${block.ogMissingCount} missing`
              : ''}
          </span>
        ) : null}
        <span>
          {ib.sizeProbe}:{' '}
          <span
            className={
              block.inventoryAvailable ? 'font-medium text-emerald-300/90' : 'text-amber-300/90'
            }
          >
            {block.inventoryAvailable ? ib.probeOn : ib.probeOff}
          </span>
          {block.inventoryAvailable && block.inventoryProbed != null
            ? ` · ${block.inventoryProbed} URLs`
            : ''}
        </span>
      </div>

      {chartItems.length > 0 ? (
        <div className="mt-4 border-t border-muted/30 pt-4">
          <p className="mb-2 text-xs text-muted-foreground">{ib.issueBreakdown}</p>
          <SimpleBarChart
            labels={chartItems.map((i) => i.label)}
            values={chartItems.map((i) => i.value)}
            ariaLabel={ib.issueBreakdown}
          />
        </div>
      ) : null}
    </div>
  );
}
