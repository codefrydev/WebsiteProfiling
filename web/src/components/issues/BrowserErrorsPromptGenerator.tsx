
import { useMemo } from 'react';
import { strings } from '@/lib/strings';
import { buildBrowserErrorsPrompt } from '@/lib/buildBrowserErrorsPrompt';
import type { FlatBrowserErrorRow } from '@/lib/browserErrors';
import AuditPromptGenerator from '@/components/issues/AuditPromptGenerator';

export interface BrowserErrorsPromptGeneratorProps {
  domain: string;
  rows: FlatBrowserErrorRow[];
  renderMode?: string;
}

export default function BrowserErrorsPromptGenerator({
  domain,
  rows,
  renderMode,
}: BrowserErrorsPromptGeneratorProps) {
  const vp = strings.views.javascriptErrors.promptGenerator;
  const built = useMemo(
    () => buildBrowserErrorsPrompt(domain, rows, renderMode),
    [domain, rows, renderMode],
  );

  return (
    <AuditPromptGenerator
      domain={domain}
      built={built}
      labels={vp}
      modalTitleId="js-errors-prompt-modal-title"
    />
  );
}
