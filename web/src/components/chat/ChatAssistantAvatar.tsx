'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import {
  resolveChatAssistantAvatarUrl,
  shouldInvertAssistantAvatar,
} from '@/lib/chatAssistantBranding';

type AvatarSize = 'sm' | 'lg';

const SIZE_STYLES: Record<
  AvatarSize,
  { shell: string; image: number; icon: string }
> = {
  lg: {
    shell: 'h-11 w-11 shadow-lg ring-2 ring-blue-500/30',
    image: 28,
    icon: 'h-6 w-6',
  },
  sm: {
    shell: 'h-8 w-8 shadow-sm',
    image: 20,
    icon: 'h-4 w-4',
  },
};

export interface ChatAssistantAvatarProps {
  size?: AvatarSize;
  className?: string;
}

export default function ChatAssistantAvatar({
  size = 'sm',
  className = '',
}: ChatAssistantAvatarProps) {
  const { llmConfigState } = usePipeline();
  const avatarUrl = resolveChatAssistantAvatarUrl(
    String(llmConfigState.llm_chat_assistant_avatar_url || ''),
  );
  const [failed, setFailed] = useState(false);
  const dims = SIZE_STYLES[size];
  const invert = shouldInvertAssistantAvatar(avatarUrl);

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600 ${dims.shell} ${className}`.trim()}
    >
      {failed ? (
        <Bot className={`${dims.icon} text-white`} aria-hidden />
      ) : (
        <img
          src={avatarUrl}
          alt=""
          width={dims.image}
          height={dims.image}
          className={invert ? 'brightness-0 invert' : undefined}
          aria-hidden
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
