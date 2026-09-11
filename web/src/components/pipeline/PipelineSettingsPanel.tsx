
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import type { IntegrationToast } from '@/types/api';
import { crawlRenderModeUsesBrowser } from '@/lib/browserCrawlStatus';
import {
  PIPELINE_CONFIG_SECTIONS,
  isPipelineFieldVisible,
  partitionFieldsByTier,
} from '@/lib/pipelineConfigSchema';
import { LLM_CONFIG_SECTIONS, isLlmFieldVisible } from '@/lib/llmConfigSchema';
import { isPipelineFieldVisibleOnPipeline } from '@/lib/secretsConfigSchema';
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

const SECRETS_BANNER_SECTIONS = new Set(['crawl', 'lighthouse', 'google', 'llm_provider']);

function SecretsLinkBanner() {
  return (
    <p className="rounded-2xl border border-md-sys-primary/20 bg-md-sys-primary-container/10 px-3 py-2 text-xs text-md-sys-on-surface-variant">
      {strings.secrets.pipelineBanner}{' '}
      <Link to="/secrets" className="press text-md-sys-primary hover:underline active:scale-[0.98]">
        {strings.secrets.pageTitle}
      </Link>
      .
    </p>
  );
}

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
      {intro ? <p className="text-xs leading-relaxed text-md-sys-on-surface-variant">{intro}</p> : null}
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
  disabled,
  onCustomCommandChange,
  onPythonExeChange,
  onRepoRootChange,
  onReset,
}: {
  customCommand: string;
  pythonExe: string;
  repoRoot: string;
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
          className="mb-1.5 block text-xs font-medium text-md-sys-on-surface-variant"
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
          className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 font-mono text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
        />
        <p className="mt-1.5 text-xs text-md-sys-on-surface-variant">{s.customCommandHelp}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="pipe-python"
            className="mb-1.5 block text-xs font-medium text-md-sys-on-surface-variant"
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
            className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 font-mono text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
          />
        </div>
        <div>
          <label
            htmlFor="pipe-repo"
            className="mb-1.5 block text-xs font-medium text-md-sys-on-surface-variant"
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
            className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 font-mono text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
          />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button
          variant="secondary"
          onClick={onReset}
          disabled={disabled}
          className="border-md-sys-warning/40 text-md-sys-warning hover:bg-md-sys-warning-container/20"
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
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <span
          className={`text-sm ${saveMsg ? (saveFailed ? 'text-md-sys-error' : 'text-md-sys-success') : 'text-xs text-md-sys-on-surface-variant'}`}
        >
          {statusHint}
        </span>
      </div>
      <Button
        variant="primary"
        onClick={() => void handleSave()}
        disabled={saveDisabled}
        className="shrink-0 rounded-full"
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
    loadError,
    llmLoadWarning,
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
    browserCrawlStatus,
    browserCrawlChecking,
  } = usePipeline();
  const { readOnly } = useReadOnlySession();
  const fieldsDisabled = readOnly;

  const showBrowserCrawlBanner =
    crawlRenderModeUsesBrowser(configState) &&
    (browserCrawlChecking || (browserCrawlStatus != null && !browserCrawlStatus.ok));

  const group = PIPELINE_SETTINGS_GROUPS.find((g) => g.id === activeGroup);

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
          {SECRETS_BANNER_SECTIONS.has(sectionId) ? <SecretsLinkBanner /> : null}
          <ConfigSectionFields
            section={pipelineSection}
            values={configState}
            disabled={fieldsDisabled}
            onChange={(key, value) => handlePipelineFieldChange(sectionId, key, value)}
            fieldFilter={(key) => isPipelineFieldVisibleOnPipeline({ key })}
          />
          {sectionId === 'crawl' ? <CrawlPageHtmlManager disabled={fieldsDisabled} /> : null}
        </>
      );
    }

    const llmSection = LLM_CONFIG_SECTIONS.find((sec) => sec.id === sectionId);
    if (llmSection) {
      const isOllama = String(llmConfigState.llm_provider || 'none') === 'ollama';
      return (
        <>
          {SECRETS_BANNER_SECTIONS.has(sectionId) ? <SecretsLinkBanner /> : null}
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
        </>
      );
    }

    return null;
  };

  if (!group) {
    return null;
  }

  const settingsCardClass = 'rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-5 sm:p-6';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {readOnly ? (
        <div className="rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/20 px-4 py-3">
          <p className="text-sm text-md-sys-on-warning-container">{strings.app.readonlyBanner}</p>
        </div>
      ) : null}
      {showBrowserCrawlBanner ? (
        <div className="rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/20 px-4 py-3">
          <p className="text-sm font-medium text-md-sys-on-warning-container">
            {s.browserCrawlBannerTitle}
          </p>
          <p className="mt-1 text-sm text-md-sys-on-warning-container/90">
            {browserCrawlChecking
              ? s.browserCrawlChecking
              : browserCrawlStatus?.message?.trim() || s.browserCrawlBannerHint}
          </p>
        </div>
      ) : null}

      {llmLoadWarning ? (
        <div className="rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/20 px-4 py-3">
          <p className="text-sm text-md-sys-on-warning-container">{llmLoadWarning}</p>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-md-sys-error/30 bg-md-sys-error-container/20 px-4 py-3">
          <p className="text-sm text-md-sys-on-error-container">
            {format(s.loadError, { message: loadError })}
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-md-sys-on-surface-variant">
          <Loader2 className="h-6 w-6 animate-spin text-md-sys-primary" />
          <span className="text-sm">{s.loadingSettings}</span>
        </div>
      ) : (
        <div className={group.id === 'google' && !useSectionTabs ? 'space-y-6' : 'space-y-4'}>
          {group.id === 'content-ai' ? (
            <p className="rounded-lg border border-md-sys-outline-variant/30 bg-md-sys-surface px-4 py-3 text-xs text-md-sys-on-surface-variant">
              {s.contentAiHint}
            </p>
          ) : null}

          {group.id === 'google' ? (
            <p className="rounded-lg border border-md-sys-outline-variant/30 bg-md-sys-surface px-4 py-3 text-xs text-md-sys-on-surface-variant">
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
