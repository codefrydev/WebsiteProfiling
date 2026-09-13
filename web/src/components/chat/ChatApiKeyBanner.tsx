import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import {
  LLM_PROVIDER_LABELS,
  isLlmCloudProvider,
} from '@/lib/llmProviderApiKeys';
import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatApiKeyBannerProps {
  provider: string;
  compact?: boolean;
}

export default function ChatApiKeyBanner({ provider, compact }: ChatApiKeyBannerProps) {
  const label = isLlmCloudProvider(provider) ? LLM_PROVIDER_LABELS[provider] : provider;

  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/30 text-md-sys-on-warning-container ${
        compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs'
      }`}
      role="status"
    >
      <AlertCircle className={`shrink-0 text-md-sys-warning ${compact ? 'mt-0 h-3.5 w-3.5' : 'mt-0.5 h-4 w-4'}`} />
      <div className="min-w-0 space-y-1">
        <p className={`font-medium text-md-sys-on-warning-container ${compact ? 'text-[11px]' : 'text-sm'}`}>
          {c.apiKeyMissingTitle}
        </p>
        <p className="text-md-sys-on-warning-container/90">{format(c.apiKeyMissingHint, { provider: label })}</p>
        <Link to="/secrets" className="press inline-block font-medium text-md-sys-primary hover:underline active:scale-[0.98]">
          {c.openSecrets}
        </Link>
      </div>
    </div>
  );
}
