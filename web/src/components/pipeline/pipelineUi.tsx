import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Check,
  FileText,
  Gauge,
  Globe,
  KeyRound,
  Loader2,
  ScanSearch,
  Sparkles,
  Square,
  Wrench,
} from 'lucide-react';
import type { PipelineJobStatus } from '@/types/api';
import type { PipelinePresetId } from './pipelinePresets';
import type { PipelineSettingsGroupId } from './pipelineSettingsGroups';
import { strings } from '@/lib/strings';
import Button from '@/components/Button';

const s = strings.pipelineRunner;

const presetStrings = strings.pipelineRunner.presets;

export const PRESET_COPY: Record<PipelinePresetId, { label: string; description: string }> = {
  'full-audit': {
    label: presetStrings.fullAudit.label,
    description: presetStrings.fullAudit.description,
  },
  'crawl-only': {
    label: presetStrings.crawlOnly.label,
    description: presetStrings.crawlOnly.description,
  },
  'report-only': {
    label: presetStrings.reportOnly.label,
    description: presetStrings.reportOnly.description,
  },
  lighthouse: {
    label: presetStrings.lighthouse.label,
    description: presetStrings.lighthouse.description,
  },
  'google-sync': {
    label: presetStrings.googleSync.label,
    description: presetStrings.googleSync.description,
  },
  'keywords-explorer': {
    label: presetStrings.keywordsExplorer.label,
    description: presetStrings.keywordsExplorer.description,
  },
};

export function getPresetLabel(id: PipelinePresetId): string {
  return PRESET_COPY[id]?.label ?? id;
}

export const PRESET_ICONS: Record<PipelinePresetId, LucideIcon> = {
  'full-audit': ScanSearch,
  'crawl-only': Globe,
  'report-only': FileText,
  lighthouse: Gauge,
  'google-sync': BarChart3,
  'keywords-explorer': KeyRound,
};

export const SETTINGS_GROUP_ICONS: Record<PipelineSettingsGroupId, LucideIcon> = {
  'crawl-report': FileText,
  lighthouse: Gauge,
  keywords: KeyRound,
  google: BarChart3,
  'content-ai': Sparkles,
  advanced: Wrench,
};

const STATUS_STYLES: Record<string, string> = {
  starting: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  running: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/30',
  success: 'bg-green-500/15 text-green-800 dark:text-green-300 border-green-500/30',
  error: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30',
};

export function PipelineStatusBadge({
  status,
  busy,
  label,
}: {
  status: PipelineJobStatus | '';
  busy?: boolean;
  label?: string;
}) {
  if (!status && !busy) return null;

  const key = busy && status !== 'error' ? 'running' : status || 'running';
  const classes = STATUS_STYLES[key] ?? STATUS_STYLES.running;
  const display = label ?? (busy && !status ? 'running' : status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}
    >
      {busy && status !== 'success' && status !== 'error' ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : status === 'success' ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <span
          className={`h-1.5 w-1.5 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-current'}`}
          aria-hidden
        />
      )}
      {display}
    </span>
  );
}

export function PipelineStopButton({
  onClick,
  disabled,
  stopping,
  className = '',
}: {
  onClick: () => void | Promise<void> | Promise<boolean>;
  disabled?: boolean;
  stopping?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="secondary"
      onClick={() => void onClick()}
      disabled={disabled || stopping}
      className={className}
      aria-label={s.stopJobAria}
    >
      {stopping ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Square className="h-4 w-4 fill-current" aria-hidden />
      )}
      {stopping ? s.stoppingJob : s.stopJob}
    </Button>
  );
}

export function PresetIcon({
  presetId,
  selected,
  className = '',
}: {
  presetId: PipelinePresetId;
  selected?: boolean;
  className?: string;
}) {
  const Icon = PRESET_ICONS[presetId];
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        selected
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
          : 'bg-brand-700/40 text-muted-foreground'
      } ${className}`.trim()}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
