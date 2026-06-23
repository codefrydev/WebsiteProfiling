
import { useMemo } from 'react';
import { strings } from '@/lib/strings';
import { buildIssuesPrompt, type CategoryIssueInput } from '@/lib/buildIssuesPrompt';
import AuditPromptGenerator from '@/components/issues/AuditPromptGenerator';
import type { ReportIssue } from '@/types/report';

export interface IssuePromptGeneratorProps {
  domain: string;
  items: CategoryIssueInput[];
  reportId: number | null;
  propertyId: number | null;
}

export default function IssuePromptGenerator({ domain, items }: IssuePromptGeneratorProps) {
  const vp = strings.views.issues.promptGenerator;
  const built = useMemo(() => buildIssuesPrompt(domain, items), [domain, items]);

  return (
    <AuditPromptGenerator
      domain={domain}
      built={built}
      labels={vp}
      modalTitleId="issue-prompt-modal-title"
    />
  );
}

export type { CategoryIssueInput, ReportIssue };
