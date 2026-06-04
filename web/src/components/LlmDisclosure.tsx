import { strings } from '@/lib/strings';
import DataSourceBadge from '@/components/DataSourceBadge';

export default function LlmDisclosure({
  llmMeta,
}: {
  llmMeta?: { model?: string; prompt_version?: string; generated_at?: string } | null;
}) {
  if (!llmMeta?.model) return null;
  const d = strings.components.llmDisclosure;
  return (
    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
      <DataSourceBadge source="ai" />
      <span>
        {d.prefix} {llmMeta.model}
        {llmMeta.prompt_version ? ` · ${d.promptVersion} ${llmMeta.prompt_version}` : ''}
        {llmMeta.generated_at ? ` · ${llmMeta.generated_at.slice(0, 19)}` : ''}
      </span>
    </p>
  );
}
