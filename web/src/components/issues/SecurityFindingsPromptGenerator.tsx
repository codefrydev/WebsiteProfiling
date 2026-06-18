'use client';

import { useMemo } from 'react';
import { strings } from '@/lib/strings';
import { buildSecurityFindingsPrompt } from '@/lib/buildSecurityFindingsPrompt';
import type { SecurityFinding } from '@/types/report';
import AuditPromptGenerator from '@/components/issues/AuditPromptGenerator';

export interface SecurityFindingsPromptGeneratorProps {
  domain: string;
  findings: SecurityFinding[];
}

export default function SecurityFindingsPromptGenerator({
  domain,
  findings,
}: SecurityFindingsPromptGeneratorProps) {
  const vp = strings.views.security.promptGenerator;
  const built = useMemo(
    () => buildSecurityFindingsPrompt(domain, findings),
    [domain, findings],
  );

  return (
    <AuditPromptGenerator
      domain={domain}
      built={built}
      labels={vp}
      modalTitleId="security-prompt-modal-title"
    />
  );
}
