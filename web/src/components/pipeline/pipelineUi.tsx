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

/** Short "what this preset includes" chips shown on each preset card. */
export const PRESET_INCLUDES: Record<PipelinePresetId, string[]> = {
  'full-audit': ['Crawl', 'Report', 'Charts', 'Lighthouse'],
  'crawl-only': ['Crawl'],
  'report-only': ['Report', 'Charts'],
  lighthouse: ['Lighthouse'],
  'google-sync': ['Search Console', 'Analytics 4'],
  'keywords-explorer': ['Keywords', 'Enrichment'],
};

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
  starting: 'bg-md-sys-warning-container/30 text-md-sys-on-warning-container border-md-sys-warning/30',
  running: 'bg-md-sys-primary-container/30 text-md-sys-on-primary-container border-md-sys-primary/30',
  success: 'bg-md-sys-success-container/30 text-md-sys-on-success-container border-md-sys-success/30',
  error: 'bg-md-sys-error-container/30 text-md-sys-on-error-container border-md-sys-error/30',
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
          className={`h-1.5 w-1.5 rounded-full ${status === 'error' ? 'bg-md-sys-error' : 'bg-current'}`}
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
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        selected
          ? 'bg-md-sys-primary-container text-md-sys-on-primary-container'
          : 'bg-md-sys-surface-container-high/40 text-md-sys-on-surface-variant'
      } ${className}`.trim()}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
