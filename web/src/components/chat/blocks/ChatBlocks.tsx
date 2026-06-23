
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { blockKey } from '@/components/chat/deriveChatBlocks';
import ChatAuditRunConfirmBlock from './ChatAuditRunConfirmBlock';
import ChatFileDownloadBlock from './ChatFileDownloadBlock';
import ChatCategoryScoresBlock from './ChatCategoryScoresBlock';
import ChatCompareCategoryBlock from './ChatCompareCategoryBlock';
import ChatGoogleSummaryBlock from './ChatGoogleSummaryBlock';
import ChatHealthTrendBlock from './ChatHealthTrendBlock';
import ChatIssueSummaryBlock from './ChatIssueSummaryBlock';
import ChatIssueTableBlock from './ChatIssueTableBlock';
import ChatLabelValueChartBlock from './ChatLabelValueChartBlock';
import ChatLighthouseBlock from './ChatLighthouseBlock';
import ChatStatusBreakdownBlock from './ChatStatusBreakdownBlock';
import ChatImageAuditBlock from './ChatImageAuditBlock';
import ChatImagePagesTableBlock from './ChatImagePagesTableBlock';
import ChatImageAttentionTableBlock from './ChatImageAttentionTableBlock';
import ChatImageLighthouseBlock from './ChatImageLighthouseBlock';
import ChatToolStatusBlock, { ChatToolTruncatedBlock } from './ChatToolStatusBlock';

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
          case 'audit_run_confirm':
            return <ChatAuditRunConfirmBlock key={key} block={block} />;
          case 'file_download':
            return <ChatFileDownloadBlock key={key} block={block} />;
          case 'image_audit_summary':
            return <ChatImageAuditBlock key={key} block={block} />;
          case 'image_pages_table':
            return <ChatImagePagesTableBlock key={key} block={block} />;
          case 'image_attention_table':
            return <ChatImageAttentionTableBlock key={key} block={block} />;
          case 'image_lighthouse_list':
            return <ChatImageLighthouseBlock key={key} block={block} />;
          case 'tool_status':
            return <ChatToolStatusBlock key={key} block={block} />;
          case 'tool_truncated':
            return <ChatToolTruncatedBlock key={key} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
