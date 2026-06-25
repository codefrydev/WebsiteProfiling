import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import { expandWorkflowToolActivity } from '@/components/chat/expandWorkflowToolActivity';
import {
  deriveChatBlocks,
  deriveFallbackBlocks,
  mergeChatBlocks,
} from '@/components/chat/deriveFallbackBlocks';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { preprocessChatMarkdown } from '@/components/chat/preprocessChatMarkdown';
import { sanitizeChatProse } from '@/components/chat/sanitizeChatProse';
import { stripRedundantMarkdown } from '@/components/chat/stripRedundantMarkdown';

export interface ToolFailure {
  name: string;
  message: string;
}

export interface PostprocessChatContentOptions {
  agentError?: string | null;
  partialError?: boolean;
}

export interface PostprocessedChatContent {
  blocks: ChatBlock[];
  prose: string;
  proseHidden: boolean;
  failedTools: ToolFailure[];
  hasPartialError: boolean;
}

export function postprocessChatContent(
  content: string,
  toolActivity: ToolActivityItem[] | undefined,
  options: PostprocessChatContentOptions = {},
): PostprocessedChatContent {
  const tools = expandWorkflowToolActivity(toolActivity ?? []);
  const vizBlocks = deriveChatBlocks(tools);
  const fallbackBlocks = deriveFallbackBlocks(tools, vizBlocks);
  const blocks = mergeChatBlocks(vizBlocks, fallbackBlocks);

  const rawContent = content.trim();
  const hasCategoryBlocks = blocks.some(
    (b) =>
      b.type === 'category_scores' ||
      b.type === 'issue_summary' ||
      b.type === 'lighthouse_scores',
  );

  const stripped = blocks.length ? stripRedundantMarkdown(rawContent, blocks) : rawContent;
  let prose = sanitizeChatProse(preprocessChatMarkdown(stripped), { hasCategoryBlocks });

  // If aggressive dedup removed everything, keep interpretation prose (headings/bullets).
  if (
    !prose.trim() &&
    rawContent.trim() &&
    /#{2,3}\s|^\s*[-*]\s+/m.test(rawContent)
  ) {
    prose = sanitizeChatProse(preprocessChatMarkdown(rawContent), { hasCategoryBlocks });
  }

  const proseHidden = Boolean(rawContent && blocks.length > 0 && !prose.trim());

  const failedTools: ToolFailure[] = tools
    .filter((t) => t.status === 'done' && t.result && typeof t.result.error === 'string')
    .map((t) => ({
      name: t.name,
      message: String(t.result?.error),
    }));

  const hasPartialError =
    Boolean(options.partialError) ||
    Boolean(options.agentError && (blocks.length > 0 || prose.trim()));

  return {
    blocks,
    prose,
    proseHidden,
    failedTools,
    hasPartialError,
  };
}
