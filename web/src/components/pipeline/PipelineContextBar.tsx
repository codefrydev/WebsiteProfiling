'use client';

import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import {
  PIPELINE_SETTINGS_GROUPS,
  type PipelineSettingsGroupId,
} from '@/components/pipeline/pipelineSettingsGroups';
import { SETTINGS_GROUP_ICONS } from '@/components/pipeline/pipelineUi';
import type { PipelineNavId } from '@/lib/pipelineNav';
import { strings } from '@/lib/strings';

const s = strings.pipelineRunner;
const groupLabels = s.settingsGroups;
const groupDescriptions = s.settingsGroupDescriptions;

function settingsGroupLabel(labelKey: string): string {
  return (groupLabels as Record<string, string>)[labelKey] ?? labelKey;
}

function settingsGroupDescription(labelKey: string): string {
  return (groupDescriptions as Record<string, string>)[labelKey] ?? '';
}

export interface PipelineContextBarProps {
  activeNav: PipelineNavId;
  headerExtra?: ReactNode;
}

export default function PipelineContextBar({ activeNav, headerExtra }: PipelineContextBarProps) {
  const isRun = activeNav === 'run';
  const group = !isRun
    ? PIPELINE_SETTINGS_GROUPS.find((g) => g.id === activeNav)
    : null;
  const title = isRun
    ? s.runTitle
    : settingsGroupLabel(group?.labelKey ?? '');
  const subtitle = isRun
    ? s.runSubtitle
    : settingsGroupDescription(group?.labelKey ?? '') || s.settingsSubtitle;
  const Icon = isRun
    ? Play
    : SETTINGS_GROUP_ICONS[activeNav as PipelineSettingsGroupId];

  return (
    <header className="chat-context-bar flex items-center gap-3 border-b border-muted/30 bg-[var(--chat-bg)] px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bright" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>

      {headerExtra ? <div className="flex shrink-0 items-center gap-2">{headerExtra}</div> : null}
    </header>
  );
}
