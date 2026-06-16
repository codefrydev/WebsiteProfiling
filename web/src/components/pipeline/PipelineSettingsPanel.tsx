'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import type { IntegrationToast, PipelineUnknownKey } from '@/types/api';
import { crawlRenderModeUsesBrowser } from '@/lib/browserCrawlStatus';
import {
  PIPELINE_CONFIG_SECTIONS,
  isPipelineFieldVisible,
  partitionFieldsByTier,
} from '@/lib/pipelineConfigSchema';
import { LLM_CONFIG_SECTIONS, isLlmFieldVisible } from '@/lib/llmConfigSchema';
import OllamaModelPicker from '@/components/pipeline/OllamaModelPicker';
import SectionFieldLayout from './SectionFieldLayout';
import { usePipeline } from '@/context/PipelineContext';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import Button from '@/components/Button';
import GoogleIntegrationsPanel from '@/components/GoogleIntegrationsPanel';
import ConfigField from './ConfigField';
import CrawlPageHtmlManager from './CrawlPageHtmlManager';
import PipelineSettingsSectionTabs from './PipelineSettingsSectionTabs';
import {
  PIPELINE_SETTINGS_GROUPS,
  type PipelineSettingsGroup,
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
  fieldFilter,
  extra,
}: {
  section: ConfigSection | LlmSection;
  values: Record<string, string | boolean | undefined>;
  disabled: boolean;
  onChange: (key: string, value: string | boolean) => void;
  fieldFilter?: (key: string) => boolean;
  extra?: ReactNode;
}) {
  const visible = section.fields
    .filter((f) => isPipelineFieldVisible(f, values))
    .filter((f) => (fieldFilter ? fieldFilter(f.key) : true));
  const { basic, advanced } = partitionFieldsByTier(visible);
  const intro = (s.sectionIntros as Record<string, string>)[section.id];

  return (
    <div className="space-y-4">
      {intro ? <p className="text-xs leading-relaxed text-muted-foreground">{intro}</p> : null}
      <SectionFieldLayout
        section={section}
        basicFields={basic}
        advancedFields={advanced}
        values={values}
        disabled={disabled}
        onChange={onChange}
        extra={extra}
      />
    </div>
  );
}

function RunnerSettingsFields({
  customCommand,
  pythonExe,
  repoRoot,
  unknownKeys,
  disabled,
  onCustomCommandChange,
  onPythonExeChange,
  onRepoRootChange,
  onReset,
}: {
  customCommand: string;
  pythonExe: string;
  repoRoot: string;
  unknownKeys: PipelineUnknownKey[];
  disabled: boolean;
  onCustomCommandChange: (value: string) => void;
  onPythonExeChange: (value: string) => void;
  onRepoRootChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
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
          onChange={(e) => onCustomCommandChange(e.target.value)}
          disabled={disabled}
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
            onChange={(e) => onPythonExeChange(e.target.value)}
            disabled={disabled}
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
            onChange={(e) => onRepoRootChange(e.target.value)}
            disabled={disabled}
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
          onClick={onReset}
          disabled={disabled}
          className="border-amber-500/40 text-amber-900 hover:bg-amber-500/10 dark:border-amber-500/35 dark:text-amber-300 dark:hover:bg-amber-500/15"
        >
          {s.resetDefaults}
        </Button>
      </div>
    </div>
  );
}

function buildSectionTabs(group: PipelineSettingsGroup | undefined): { id: string; label: string }[] {
  if (!group) return [];

  const tabs: { id: string; label: string }[] = [];

  if (group.id === 'google') {
    tabs.push({ id: 'integrations', label: s.settingsTabIntegrations });
  }

  for (const sectionId of group.sectionIds) {
    const section = PIPELINE_CONFIG_SECTIONS.find((sec) => sec.id === sectionId);
    if (section) {
      tabs.push({ id: section.id, label: section.label });
    }
  }

  if (group.includesLlm) {
    for (const section of LLM_CONFIG_SECTIONS) {
      tabs.push({ id: section.id, label: section.label });
    }
  }

  if (group.id === 'advanced') {
    tabs.push({ id: 'runner', label: s.settingsTabRunner });
  }

  return tabs;
}

export function PipelineSettingsSaveBar({ onSaved }: { onSaved?: () => void }) {
  const { loading, saving, saveMsg, busy, saveSettings } = usePipeline();
  const { readOnly } = useReadOnlySession();

  const handleSave = async () => {
    const ok = await saveSettings();
    if (ok) onSaved?.();
  };

  const saveFailed = saveMsg.includes('Save failed') || saveMsg.includes('failed');
  const saveDisabled = saving || loading || readOnly;

  const statusHint = saveMsg
    ? saveMsg
    : busy
      ? s.settingsSaveWhileRunningHint
      : s.settingsSubtitle;

  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 lg:px-8">
      <div className="min-w-0 flex-1">
        <span
          className={`text-sm ${saveMsg ? (saveFailed ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400') : 'text-xs text-muted-foreground'}`}
        >
          {statusHint}
        </span>
      </div>
      <Button
        variant="primary"
        onClick={() => void handleSave()}
        disabled={saveDisabled}
        className="shrink-0"
      >
        <Save className="h-4 w-4" aria-hidden />
        {readOnly ? strings.app.readonlyBanner : saving ? s.saving : s.saveSettings}
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
    handleStartUrlChange,
    resetConfig,
    dismissLegacyBanner,
    browserCrawlStatus,
    browserCrawlChecking,
  } = usePipeline();
  const { readOnly } = useReadOnlySession();
  const fieldsDisabled = readOnly;

  const showBrowserCrawlBanner =
    crawlRenderModeUsesBrowser(configState) &&
    (browserCrawlChecking || (browserCrawlStatus != null && !browserCrawlStatus.ok));

  const group = PIPELINE_SETTINGS_GROUPS.find((g) => g.id === activeGroup);
  const showLegacyBanner = configSource === 'legacy' && !legacyBannerDismissed && activeGroup === 'crawl-report';

  const sectionTabs = useMemo(() => buildSectionTabs(group), [group]);
  const sectionTabIds = useMemo(
    () => sectionTabs.map((tab) => tab.id).join(','),
    [sectionTabs],
  );

  const useSectionTabs = sectionTabs.length > 1;
  const [activeSectionTab, setActiveSectionTab] = useState(sectionTabs[0]?.id ?? '');

  useEffect(() => {
    setActiveSectionTab(sectionTabs[0]?.id ?? '');
  }, [activeGroup, sectionTabs]);

  useEffect(() => {
    setActiveSectionTab((current) =>
      sectionTabs.some((tab) => tab.id === current) ? current : (sectionTabs[0]?.id ?? ''),
    );
  }, [sectionTabIds, sectionTabs]);

  const activeTabId =
    sectionTabs.find((tab) => tab.id === activeSectionTab)?.id ?? sectionTabs[0]?.id ?? '';

  const handlePipelineFieldChange = (sectionId: string, key: string, value: string | boolean) => {
    if (sectionId === 'crawl' && key === 'start_url') {
      handleStartUrlChange(String(value));
      return;
    }
    setField(key, value);
  };

  const renderSectionContent = (sectionId: string): ReactNode => {
    if (sectionId === 'integrations') {
      return (
        <GoogleIntegrationsPanel
          initialToast={googleIntegrationsToast}
          startUrl={String(configState.start_url || '')}
        />
      );
    }

    if (sectionId === 'runner') {
      return (
        <RunnerSettingsFields
          customCommand={customCommand}
          pythonExe={pythonExe}
          repoRoot={repoRoot}
          unknownKeys={unknownKeys}
          disabled={fieldsDisabled}
          onCustomCommandChange={setCustomCommand}
          onPythonExeChange={setPythonExe}
          onRepoRootChange={setRepoRoot}
          onReset={resetConfig}
        />
      );
    }

    const pipelineSection = PIPELINE_CONFIG_SECTIONS.find((sec) => sec.id === sectionId);
    if (pipelineSection) {
      return (
        <>
          <ConfigSectionFields
            section={pipelineSection}
            values={configState}
            disabled={fieldsDisabled}
            onChange={(key, value) => handlePipelineFieldChange(sectionId, key, value)}
          />
          {sectionId === 'crawl' ? <CrawlPageHtmlManager disabled={fieldsDisabled} /> : null}
        </>
      );
    }

    const llmSection = LLM_CONFIG_SECTIONS.find((sec) => sec.id === sectionId);
    if (llmSection) {
      const isOllama = String(llmConfigState.llm_provider || 'none') === 'ollama';
      return (
        <ConfigSectionFields
          section={llmSection}
          values={llmConfigState}
          disabled={fieldsDisabled}
          onChange={(key, value) => setLlmField(key, value)}
          fieldFilter={(key) => isLlmFieldVisible(key, llmConfigState)}
          extra={
            llmSection.id === 'llm_provider' && isOllama ? (
              <OllamaModelPicker
                model={String(llmConfigState.llm_model || '')}
                baseUrl={String(llmConfigState.llm_base_url || 'http://127.0.0.1:11434')}
                disabled={fieldsDisabled}
                onModelChange={(v) => setLlmField('llm_model', v)}
              />
            ) : null
          }
        />
      );
    }

    return null;
  };

  if (!group) {
    return null;
  }

  const settingsCardClass = 'rounded-xl border border-default bg-brand-800/60 p-5 sm:p-6';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {readOnly ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-950 dark:text-amber-100/90">{strings.app.readonlyBanner}</p>
        </div>
      ) : null}
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
                tabs={sectionTabs}
                activeTab={activeSectionTab}
                onChange={setActiveSectionTab}
                ariaLabel={s.settingsSectionTabsLabel}
              />
              {activeTabId ? (
                <div
                  id={`pipe-settings-panel-${activeTabId}`}
                  role="tabpanel"
                  aria-labelledby={`pipe-settings-tab-${activeTabId}`}
                  className={settingsCardClass}
                >
                  {renderSectionContent(activeTabId)}
                </div>
              ) : null}
            </>
          ) : (
            <div className={settingsCardClass}>{activeTabId ? renderSectionContent(activeTabId) : null}</div>
          )}
        </div>
      )}
    </div>
  );
}
