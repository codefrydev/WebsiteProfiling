'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import type { IntegrationToast } from '@/types/api';
import { crawlRenderModeUsesBrowser } from '@/lib/browserCrawlStatus';
import { PIPELINE_CONFIG_SECTIONS, isPipelineFieldVisible } from '@/lib/pipelineConfigSchema';
import { LLM_CONFIG_SECTIONS } from '@/lib/llmConfigSchema';
import { usePipeline } from '@/context/PipelineContext';
import Button from '@/components/Button';
import GoogleIntegrationsPanel from '@/components/GoogleIntegrationsPanel';
import ConfigField from './ConfigField';
import PipelineSettingsSectionTabs from './PipelineSettingsSectionTabs';
import {
  PIPELINE_SETTINGS_GROUPS,
  type PipelineSettingsGroupId,
} from './pipelineSettingsGroups';

const s = strings.pipelineRunner;

type ConfigSection = (typeof PIPELINE_CONFIG_SECTIONS)[number];
type LlmSection = (typeof LLM_CONFIG_SECTIONS)[number];

export interface PipelineSettingsPanelProps {
  activeGroup: PipelineSettingsGroupId;
  googleIntegrationsToast?: IntegrationToast | null;
  onSaved?: () => void;
}

function ConfigSectionFields({
  section,
  values,
  disabled,
  onChange,
}: {
  section: ConfigSection | LlmSection;
  values: Record<string, string | boolean | undefined>;
  disabled: boolean;
  onChange: (key: string, value: string | boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {section.fields.filter((f) => isPipelineFieldVisible(f, values)).map((f) => (
        <ConfigField
          key={f.key}
          field={f}
          value={values[f.key]}
          disabled={disabled}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
    </div>
  );
}

export function PipelineSettingsSaveBar({ onSaved }: { onSaved?: () => void }) {
  const { loading, saving, saveMsg, busy, saveSettings } = usePipeline();

  const handleSave = async () => {
    const ok = await saveSettings();
    if (ok) onSaved?.();
  };

  const saveFailed = saveMsg.includes('Save failed') || saveMsg.includes('failed');

  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 lg:px-8">
      <div className="min-w-0 flex-1">
        {saveMsg ? (
          <span
            className={`text-sm ${saveFailed ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
          >
            {saveMsg}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{s.settingsSubtitle}</span>
        )}
      </div>
      <Button
        variant="primary"
        onClick={() => void handleSave()}
        disabled={busy || saving || loading}
        className="shrink-0"
      >
        <Save className="h-4 w-4" aria-hidden />
        {saving ? s.saving : s.saveSettings}
      </Button>
    </div>
  );
}

export default function PipelineSettingsPanel({
  activeGroup,
  googleIntegrationsToast,
}: PipelineSettingsPanelProps) {
  const {
    loading,
    busy,
    configState,
    llmConfigState,
    unknownKeys,
    configSource,
    legacyBannerDismissed,
    loadError,
    pythonExe,
    repoRoot,
    customCommand,
    setField,
    setLlmField,
    setPythonExe,
    setRepoRoot,
    setCustomCommand,
    resetConfig,
    dismissLegacyBanner,
    browserCrawlStatus,
    browserCrawlChecking,
  } = usePipeline();

  const showBrowserCrawlBanner =
    crawlRenderModeUsesBrowser(configState) &&
    (browserCrawlChecking || (browserCrawlStatus != null && !browserCrawlStatus.ok));

  const group = PIPELINE_SETTINGS_GROUPS.find((g) => g.id === activeGroup);
  const showLegacyBanner = configSource === 'legacy' && !legacyBannerDismissed && activeGroup === 'crawl-report';

  const sectionPanels = useMemo(() => {
    if (!group) return [];

    const panels: { id: string; label: string; content: ReactNode }[] = [];

    if (group.id === 'google') {
      panels.push({
        id: 'integrations',
        label: s.settingsTabIntegrations,
        content: (
          <GoogleIntegrationsPanel
            initialToast={googleIntegrationsToast}
            startUrl={String(configState.start_url || '')}
          />
        ),
      });
    }

    for (const sectionId of group.sectionIds) {
      const section = PIPELINE_CONFIG_SECTIONS.find((sec) => sec.id === sectionId);
      if (!section) continue;
      panels.push({
        id: section.id,
        label: section.label,
        content: (
          <ConfigSectionFields
            section={section}
            values={configState}
            disabled={busy}
            onChange={(key, value) => setField(key, value)}
          />
        ),
      });
    }

    if (group.includesLlm) {
      for (const section of LLM_CONFIG_SECTIONS) {
        panels.push({
          id: section.id,
          label: section.label,
          content: (
            <ConfigSectionFields
              section={section}
              values={llmConfigState}
              disabled={busy}
              onChange={(key, value) => setLlmField(key, value)}
            />
          ),
        });
      }
    }

    if (group.id === 'advanced') {
      panels.push({
        id: 'runner',
        label: s.settingsTabRunner,
        content: (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="pipe-custom-command"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                {s.customCommandLabel}
              </label>
              <input
                id="pipe-custom-command"
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                disabled={busy}
                placeholder="e.g. warnings, enrich, plot"
                className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 font-mono text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{s.customCommandHelp}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pipe-python"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  {s.pythonExeLabel}
                </label>
                <input
                  id="pipe-python"
                  type="text"
                  value={pythonExe}
                  onChange={(e) => setPythonExe(e.target.value)}
                  disabled={busy}
                  placeholder="python"
                  className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 font-mono text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label
                  htmlFor="pipe-repo"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  {s.repoRootLabel}
                </label>
                <input
                  id="pipe-repo"
                  type="text"
                  value={repoRoot}
                  onChange={(e) => setRepoRoot(e.target.value)}
                  disabled={busy}
                  placeholder="Default: parent folder of web/"
                  className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 font-mono text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            {unknownKeys.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{s.unknownKeysHelp}</p>
                <div className="space-y-1 rounded-lg border border-default bg-brand-900 p-3 font-mono text-xs text-foreground">
                  {unknownKeys.map(({ key, value }) => (
                    <div key={key}>
                      <span className="text-link">{key}</span>
                      {' = '}
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                onClick={resetConfig}
                disabled={busy}
                className="border-amber-500/40 text-amber-900 hover:bg-amber-500/10 dark:border-amber-500/35 dark:text-amber-300 dark:hover:bg-amber-500/15"
              >
                {s.resetDefaults}
              </Button>
            </div>
          </div>
        ),
      });
    }

    return panels;
  }, [
    group,
    busy,
    configState,
    llmConfigState,
    googleIntegrationsToast,
    customCommand,
    pythonExe,
    repoRoot,
    unknownKeys,
    setField,
    setLlmField,
    setCustomCommand,
    setPythonExe,
    setRepoRoot,
    resetConfig,
  ]);

  const useSectionTabs = sectionPanels.length > 1;
  const [activeSectionTab, setActiveSectionTab] = useState(sectionPanels[0]?.id ?? '');

  useEffect(() => {
    setActiveSectionTab(sectionPanels[0]?.id ?? '');
  }, [activeGroup]);

  useEffect(() => {
    setActiveSectionTab((current) =>
      sectionPanels.some((p) => p.id === current) ? current : (sectionPanels[0]?.id ?? ''),
    );
  }, [sectionPanels]);

  const activePanel = sectionPanels.find((p) => p.id === activeSectionTab) ?? sectionPanels[0];

  if (!group) {
    return null;
  }

  const settingsCardClass = 'rounded-xl border border-default bg-brand-800/60 p-5 sm:p-6';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {showBrowserCrawlBanner ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100/90">
            {s.browserCrawlBannerTitle}
          </p>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/80">
            {browserCrawlChecking
              ? s.browserCrawlChecking
              : browserCrawlStatus?.message?.trim() || s.browserCrawlBannerHint}
          </p>
        </div>
      ) : null}
      {showLegacyBanner ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="flex-1 text-sm text-amber-950 dark:text-amber-100/90">{s.legacyBanner}</p>
          <button
            type="button"
            onClick={dismissLegacyBanner}
            className="shrink-0 rounded-lg p-1.5 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
            aria-label={s.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">
            {format(s.loadError, { message: loadError })}
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-link" />
          <span className="text-sm">{s.loadingSettings}</span>
        </div>
      ) : (
        <div className={group.id === 'google' && !useSectionTabs ? 'space-y-6' : 'space-y-4'}>
          {group.id === 'content-ai' ? (
            <p className="rounded-lg border border-default bg-brand-900/50 px-4 py-3 text-xs text-muted-foreground">
              {s.contentAiHint}
            </p>
          ) : null}

          {group.id === 'google' ? (
            <p className="rounded-lg border border-default bg-brand-900/50 px-4 py-3 text-xs text-muted-foreground">
              {s.googleGroupHint}
            </p>
          ) : null}

          {useSectionTabs ? (
            <>
              <PipelineSettingsSectionTabs
                tabs={sectionPanels.map((p) => ({ id: p.id, label: p.label }))}
                activeTab={activeSectionTab}
                onChange={setActiveSectionTab}
                ariaLabel={s.settingsSectionTabsLabel}
              />
              {activePanel ? (
                <div
                  id={`pipe-settings-panel-${activePanel.id}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-settings-tab-${activePanel.id}`}
                  className={settingsCardClass}
                >
                  {activePanel.content}
                </div>
              ) : null}
            </>
          ) : (
            <div className={settingsCardClass}>
              {activePanel?.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
