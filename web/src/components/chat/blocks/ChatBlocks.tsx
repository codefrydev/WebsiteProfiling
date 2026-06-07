'use client';

import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { blockKey } from '@/components/chat/deriveChatBlocks';
import ChatCategoryScoresBlock from './ChatCategoryScoresBlock';
import ChatCompareCategoryBlock from './ChatCompareCategoryBlock';
import ChatGoogleSummaryBlock from './ChatGoogleSummaryBlock';
import ChatHealthTrendBlock from './ChatHealthTrendBlock';
import ChatIssueSummaryBlock from './ChatIssueSummaryBlock';
import ChatIssueTableBlock from './ChatIssueTableBlock';
import ChatLabelValueChartBlock from './ChatLabelValueChartBlock';
import ChatLighthouseBlock from './ChatLighthouseBlock';
import ChatStatusBreakdownBlock from './ChatStatusBreakdownBlock';

export interface ChatBlocksProps {
  blocks: ChatBlock[];
}

export default function ChatBlocks({ blocks }: ChatBlocksProps) {
  if (!blocks.length) return null;

  return (
    <div className="space-y-3">
      {blocks.map((block) => {
        const key = blockKey(block);
        switch (block.type) {
          case 'issue_summary':
            return <ChatIssueSummaryBlock key={key} block={block} />;
          case 'issue_table':
            return <ChatIssueTableBlock key={key} block={block} />;
          case 'category_scores':
            return <ChatCategoryScoresBlock key={key} block={block} />;
          case 'label_value_chart':
            return <ChatLabelValueChartBlock key={key} block={block} />;
          case 'status_breakdown':
            return <ChatStatusBreakdownBlock key={key} block={block} />;
          case 'health_trend':
            return <ChatHealthTrendBlock key={key} block={block} />;
          case 'compare_category_deltas':
            return <ChatCompareCategoryBlock key={key} block={block} />;
          case 'lighthouse_scores':
            return <ChatLighthouseBlock key={key} block={block} />;
          case 'google_summary':
            return <ChatGoogleSummaryBlock key={key} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
