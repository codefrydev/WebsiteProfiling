'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Gauge,
  Globe,
  Loader2,
  Play,
  ScanSearch,
  Terminal,
} from 'lucide-react';
import { strings } from '@/lib/strings';
import Button from '@/components/Button';
import Card from '@/components/Card';
import AlertBanner from '@/components/AlertBanner';
import EmptyState from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { usePipeline } from '@/context/PipelineContext';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import {
  PipelineStatusBadge,
  PipelineStopButton,
  PRESET_COPY,
  PRESET_INCLUDES,
  PresetIcon,
} from './pipelineUi';
import { PIPELINE_PRESETS } from './pipelinePresets';
import { CRAWL_PRESETS, type CrawlPresetId } from '@/lib/crawlPresets';
import PipelineWizardProgress, { type WizardStep } from './PipelineWizardProgress';
import PipelineLogViewer from './PipelineLogViewer';
import PipelineProgressHeader from './PipelineProgressHeader';
import CrawlAuthorizeCheckbox from './CrawlAuthorizeCheckbox';
import PipelineRunPreviewCard from './PipelineRunPreviewCard';
import { buildPipelineRunPreview } from '@/lib/pipelineRunPreview';
import { computeLivePipelineEstimate } from '@/lib/pipelineLiveEstimate';
import { parsePipelineProgressEvents, resolveActiveProgress } from '@/lib/formatPipelineLog';
import { apiUrl, apiFetch } from '@/lib/publicBase';

const s = strings.pipelineRunner;
const crawlPresets = s.crawlPresets as Record<string, { label: string; maxPages: string; stream?: boolean }>;

function isValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('://')) return trimmed;
  return `https://${trimmed}`;
}

export default function PipelineRunPanel() {
  const {
    busy,
    loading,
    status,
    log,
    logTruncated,
    startUrl,
    configState,
    customCommand,
    presetId,
    handleStartUrlChange,
    handlePresetChange,
    crawlPresetId,
    handleCrawlPresetChange,
    setField,
    run,
    cancelJob,
    stopping,
    continueInBackground,
    activeJobId,
  } = usePipeline();
  const { readOnly } = useReadOnlySession();

  const pauseJob = async () => {
    if (!activeJobId) return;
    await apiFetch(apiUrl(`/jobs/${encodeURIComponent(activeJobId)}/pause`), { method: 'POST' });
  };

  const resumeJob = async () => {
    if (!activeJobId) return;
    await apiFetch(apiUrl(`/jobs/${encodeURIComponent(activeJobId)}/resume`), { method: 'POST' });
  };

  const [crawlAuthorized, setCrawlAuthorized] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [maxStep, setMaxStep] = useState<WizardStep>(1);
  const [outputOpen, setOutputOpen] = useState(true);

  useEffect(() => {
    if (step === 1) {
      urlInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (busy || status === 'running' || status === 'starting') {
      setStep(3);
      setMaxStep(3);
    }
  }, [busy, status]);

  useEffect(() => {
    if (status === 'error') {
      setOutputOpen(true);
    } else if (status === 'running' || status === 'starting') {
      setOutputOpen(true);
    }
  }, [status, log]);

  const disabled = busy || loading || readOnly;
  const urlValid = isValidUrl(startUrl);
  const presetCopy = PRESET_COPY[presetId];
  const crawlOnlyNote =
    presetId === 'crawl-only' ? strings.reportSelector.crawlOnlyNote : null;
  const showProgress = busy || Boolean(status) || Boolean(log);
  const isFirstRun = step === 1 && !startUrl.trim() && !status && !log && !busy;

  const runPreview = useMemo(
    () =>
      buildPipelineRunPreview({
        presetId,
        configState,
        customCommand,
        crawlPresetId,
      }),
    [presetId, configState, customCommand, crawlPresetId],
  );

  const liveEstimate = useMemo(() => {
    const isRunning = busy || status === 'running' || status === 'starting';
    if (!isRunning || !log.trim()) return null;
    const events = parsePipelineProgressEvents(log);
    const latest = resolveActiveProgress(events, status);
    return computeLivePipelineEstimate(runPreview, events, latest, status);
  }, [busy, status, log, runPreview]);

  const goToStep = (next: WizardStep) => {
    setStep(next);
    setMaxStep((prev) => (next > prev ? next : prev));
  };

  const handleContinueFromUrl = () => {
    if (!urlValid) return;
    handleStartUrlChange(normalizeUrl(startUrl));
    goToStep(2);
  };

  const handleUrlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && urlValid && !disabled) {
      handleContinueFromUrl();
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {isFirstRun ? (
        <EmptyState
          aurora
          icon={ScanSearch}
          title={s.firstRunTitle}
          description={s.firstRunBody}
          highlights={[
            { icon: Globe, label: s.firstRunHighlightCrawl },
            { icon: FileText, label: s.firstRunHighlightReport },
            { icon: Gauge, label: s.firstRunHighlightPerf },
          ]}
          className="mb-6"
        />
      ) : null}
      <Card padding="tight" className="mb-6">
        <PipelineWizardProgress
          currentStep={step}
          maxReachableStep={maxStep}
          onStepClick={(target) => !disabled && goToStep(target)}
        />
      </Card>

      {step > 1 ? (
        <div className="mb-4 space-y-2">
          {step >= 2 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-default bg-brand-800/60 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm text-foreground">{normalizeUrl(startUrl)}</span>
              </div>
              {step > 1 && !disabled ? (
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="shrink-0 text-xs font-medium text-link hover:underline"
                >
                  {s.wizardEdit}
                </button>
              ) : null}
            </div>
          ) : null}
          {step >= 3 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-default bg-brand-800/60 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <PresetIcon presetId={presetId} selected className="h-7 w-7 rounded-md" />
                <span className="truncate text-sm font-medium text-foreground">{presetCopy.label}</span>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="shrink-0 text-xs font-medium text-link hover:underline"
                >
                  {s.wizardEdit}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <Card className="overflow-hidden">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Globe className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{s.startUrlLabel}</h2>
              <p className="text-xs text-muted-foreground">{s.wizardUrlHint}</p>
            </div>
          </div>
          <input
            ref={urlInputRef}
            id="pipe-start-url"
            type="url"
            value={startUrl}
            onChange={(e) => handleStartUrlChange(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            disabled={disabled}
            placeholder={s.startUrlPlaceholder}
            className="mt-4 w-full rounded-lg border border-default bg-brand-900 px-3 py-3 text-sm text-foreground transition focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="mt-4 space-y-2">
            <span className="text-xs text-muted-foreground font-medium">Crawl preset</span>
            <div className="flex flex-wrap gap-2">
              {CRAWL_PRESETS.map((preset) => {
                const selected = crawlPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    title={preset.description}
                    onClick={() => handleCrawlPresetChange(preset.id as CrawlPresetId)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? 'border-blue-500/60 bg-blue-500/10 text-foreground'
                        : 'border-default bg-brand-900/80 text-foreground hover:border-blue-500/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <AlertBanner
            variant="info"
            collapsible
            defaultOpen={false}
            title={s.wizardRunExplainerTitle}
            className="mt-4"
          >
            <ol className="ml-1 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
              {s.wizardRunExplainerSteps.map((stepText) => (
                <li key={stepText}>{stepText}</li>
              ))}
            </ol>
            <p className="mt-1.5 text-xs text-muted-foreground">{s.wizardRunExplainerNote}</p>
          </AlertBanner>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="primary"
              onClick={handleContinueFromUrl}
              disabled={disabled || !urlValid}
              className="px-5 py-2.5"
            >
              {s.wizardNext}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="pipe-presets-heading">
          <div className="mb-4">
            <h2 id="pipe-presets-heading" className="text-base font-semibold text-foreground">
              {s.presetsLabel}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{s.wizardWorkflowHint}</p>
            {loading ? (
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {s.loadingSettings}
              </span>
            ) : null}
          </div>
          <div className="space-y-2">
            {PIPELINE_PRESETS.map((preset) => {
              const copy = PRESET_COPY[preset.id];
              const selected = presetId === preset.id;
              return (
                <Card
                  key={preset.id}
                  padding="tight"
                  onClick={disabled ? undefined : () => handlePresetChange(preset.id)}
                  className={`relative cursor-pointer transition-all ${
                    selected
                      ? 'border-blue-500/70 bg-blue-500/5 ring-2 ring-blue-500/20'
                      : 'hover:border-muted-foreground/30 hover:bg-brand-800/80'
                  } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <PresetIcon presetId={preset.id} selected={selected} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{copy.label}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{copy.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {PRESET_INCLUDES[preset.id].map((item) => (
                          <span
                            key={item}
                            className="rounded bg-brand-700/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    {selected ? (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
          {crawlOnlyNote ? (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200/90">
              {crawlOnlyNote}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => goToStep(1)} disabled={disabled} className="py-2.5">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {s.wizardBack}
            </Button>
            <Button variant="primary" onClick={() => goToStep(3)} disabled={disabled} className="px-5 py-2.5">
              {s.wizardNext}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold text-foreground">{s.wizardReviewTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{s.wizardReviewHint}</p>

            <dl className="mt-5 divide-y divide-[color:var(--app-border-muted)]">
              <div className="py-3 first:pt-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.startUrlLabel}
                </dt>
                <dd className="mt-1 truncate text-sm text-foreground">{normalizeUrl(startUrl)}</dd>
              </div>
              <div className="py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.presetsLabel}
                </dt>
                <dd className="mt-2 flex items-start gap-3">
                  <PresetIcon presetId={presetId} selected className="h-9 w-9 rounded-lg" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{presetCopy.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{presetCopy.description}</p>
                  </div>
                </dd>
              </div>
            </dl>

            <PipelineRunPreviewCard
              presetId={presetId}
              configState={configState}
              customCommand={customCommand}
              crawlPresetId={crawlPresetId}
              liveEstimate={liveEstimate}
            />

            <div className="mt-5">
              <CrawlAuthorizeCheckbox
                checked={crawlAuthorized}
                onChange={setCrawlAuthorized}
                disabled={readOnly}
              />
            </div>
            {readOnly ? (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{strings.app.readonlyBanner}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-muted pt-5">
              <div>
                {!busy ? (
                  <Button variant="secondary" onClick={() => goToStep(2)} disabled={disabled} className="py-2.5">
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {s.wizardBack}
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {busy ? (
                  <>
                    <PipelineStopButton
                      onClick={cancelJob}
                      stopping={stopping}
                      disabled={readOnly}
                      className="py-2.5"
                    />
                    <Button variant="secondary" onClick={continueInBackground} className="py-2.5">
                      {s.continueInBackground}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => void run()}
                  disabled={disabled || !urlValid || !crawlAuthorized}
                  className="min-w-[8.5rem] px-6 py-2.5"
                  title={!crawlAuthorized ? strings.components.crawlAuthorize.required : undefined}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {s.runningButton}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden />
                      {s.runButton}
                    </>
                  )}
                </Button>
              </div>
            </div>
            {!crawlAuthorized && !busy && !readOnly ? (
              <p className="mt-2 text-right text-xs text-muted-foreground">
                {strings.components.crawlAuthorize.required}
              </p>
            ) : null}
          </Card>

          {showProgress ? (
            <Card padding="tight" className="overflow-hidden">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium text-foreground">{s.outputLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  {busy ? (
                    <PipelineStopButton
                      onClick={cancelJob}
                      stopping={stopping}
                      disabled={readOnly}
                      className="py-1.5"
                    />
                  ) : null}
                  <PipelineStatusBadge status={status} busy={busy} />
                </div>
              </div>

              {log ? (
                <PipelineProgressHeader
                  log={log}
                  status={status}
                  liveEstimate={liveEstimate}
                  className="mb-3"
                  onPause={!readOnly ? pauseJob : undefined}
                  onResume={!readOnly ? resumeJob : undefined}
                />
              ) : null}

              {log ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setOutputOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-default bg-brand-900/80 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-brand-900"
                  >
                    {outputOpen ? 'Hide log' : 'Show log'}
                    {outputOpen ? (
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  {outputOpen ? (
                    <PipelineLogViewer
                      log={log}
                      status={status}
                      logTruncated={logTruncated}
                      autoScroll={busy || status === 'running' || status === 'starting'}
                      className="mt-2"
                    />
                  ) : null}
                </div>
              ) : status === 'error' ? (
                <AlertBanner variant="error">
                  No log output was returned. Open the browser developer console for the full error
                  (filter by <span className="font-mono">{strings.pipelineRunner.consoleFilterHint}</span>).
                </AlertBanner>
              ) : busy ? (
                <div className="rounded-lg border border-dashed border-default bg-brand-900/50 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-link" aria-hidden />
                    Waiting for output…
                  </div>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-2.5 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                    <Skeleton className="h-2.5 w-2/3" />
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
