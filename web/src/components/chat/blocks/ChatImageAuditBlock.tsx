'use client';

import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import ImageAuditSummaryCards from '@/components/imageSeo/ImageAuditSummaryCards';

type Block = Extract<ChatBlock, { type: 'image_audit_summary' }>;

export default function ChatImageAuditBlock({ block }: { block: Block }) {
  return (
    <ImageAuditSummaryCards
      className="bg-[var(--chat-bg)]/60"
      data={{
        pagesMissingAlt: block.pagesMissingAlt,
        pagesWithoutLazy: block.pagesWithoutLazy,
        pagesMissingDimensions: block.pagesMissingDimensions,
        lighthouseImageDiagnostics: block.lighthouseImageDiagnostics,
        imagesTotal: block.imagesTotal,
        ogCoveragePct: block.ogCoveragePct,
        ogMissingCount: block.ogMissingCount,
        inventoryAvailable: block.inventoryAvailable,
        inventoryProbed: block.inventoryProbed,
      }}
    />
  );
}
