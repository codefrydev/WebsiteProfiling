
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildIssueContext } from '@/lib/fixSuggestionContext';
import type { ReportIssue } from '@/types';

export interface IssueAiFixButtonProps {
  issue: ReportIssue;
  category: string;
}

export default function IssueAiFixButton({ issue, category }: IssueAiFixButtonProps) {
  const initialText =
    typeof issue.llm_recommendation === 'string' ? issue.llm_recommendation : null;
  return (
    <AiSuggestionButton
      request={buildIssueContext(issue, category)}
      initialText={initialText}
    />
  );
}
