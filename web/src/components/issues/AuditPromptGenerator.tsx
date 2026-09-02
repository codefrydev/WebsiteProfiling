
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, FileText, MessageSquare, Sparkles, X } from 'lucide-react';
import { Button } from '@/components';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { format } from '@/lib/strings';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import {
  formatActionPlanSection,
  issuesForActionPlanApi,
  type BuildIssuesPromptResult,
} from '@/lib/buildIssuesPrompt';
import { buildChatFabHref, writeChatComposerDraft } from '@/lib/chatUrlState';
import { useModalDismiss } from '@/hooks/useModalDismiss';

export interface PromptGeneratorLabels {
  generatePrompt: string;
  promptModalTitle: string;
  promptModalHint: string;
  promptDedupeSummary: string;
  copyPrompt: string;
  copyFullPrompt: string;
  copiedPrompt: string;
  getAiPlan: string;
  aiPlanLoading: string;
  aiPlanFailed: string;
  regenerateAiPlan: string;
  openInChat: string;
}

export interface AuditPromptGeneratorProps {
  domain: string;
  built: BuildIssuesPromptResult;
  labels: PromptGeneratorLabels;
  modalTitleId?: string;
}

export default function AuditPromptGenerator({
  domain,
  built,
  labels: vp,
  modalTitleId = 'audit-prompt-modal-title',
}: AuditPromptGeneratorProps) {
  const navigate = useNavigate();
  const { readOnly } = useReadOnlySession();
  const [open, setOpen] = useState(false);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fullText = useMemo(() => {
    if (!aiPlan) return built.prompt;
    return `${built.prompt}${formatActionPlanSection(aiPlan)}`;
  }, [built.prompt, aiPlan]);

  const openModal = useCallback(() => {
    setOpen(true);
    setAiPlan(null);
    setAiError(null);
    setCopied(false);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    setAiLoading(false);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [fullText]);

  const fetchAiPlan = useCallback(async () => {
    if (readOnly) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch(apiUrl('/issues/action-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          issues: built.apiIssues ?? issuesForActionPlanApi(built.issues),
          refresh: !!aiPlan,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; plan?: string; error?: string };
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || vp.aiPlanFailed);
      }
      const plan = String(payload.plan || '').trim();
      if (!plan) throw new Error(vp.aiPlanFailed);
      setAiPlan(plan);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : vp.aiPlanFailed);
    } finally {
      setAiLoading(false);
    }
  }, [readOnly, domain, built.apiIssues, built.issues, aiPlan, vp.aiPlanFailed]);

  const handleOpenInChat = useCallback(() => {
    writeChatComposerDraft({ domain, text: fullText });
    navigate(buildChatFabHref(domain));
  }, [domain, fullText, navigate]);

  useModalDismiss({
    onDismiss: closeModal,
    enabled: open,
    lockScroll: true,
  });

  if (built.rawCount === 0) return null;

  return (
    <>
      <Button type="button" variant="secondary" onClick={openModal} className="!text-xs">
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {vp.generatePrompt}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-default bg-brand-800 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-muted px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0 text-link" aria-hidden />
                  <h2 id={modalTitleId} className="font-semibold text-foreground">
                    {vp.promptModalTitle}
                  </h2>
                </div>
                <p className="mt-1 pl-7 text-xs text-muted-foreground">{vp.promptModalHint}</p>
                <p className="mt-1 pl-7 text-xs font-medium text-foreground">
                  {format(vp.promptDedupeSummary, {
                    unique: built.uniqueCount,
                    total: built.rawCount,
                  })}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <textarea
                readOnly
                value={fullText}
                className="w-full min-h-[320px] resize-y rounded-lg border border-default bg-brand-900 p-3 font-mono text-xs leading-relaxed text-foreground"
                aria-label={vp.promptModalTitle}
              />
              {aiError ? <p className="mt-2 text-xs text-red-700 dark:text-red-400">{aiError}</p> : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-muted px-6 py-4">
              <Button type="button" variant="secondary" className="!text-xs" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? vp.copiedPrompt : aiPlan ? vp.copyFullPrompt : vp.copyPrompt}
              </Button>

              {!readOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!text-xs"
                  loading={aiLoading}
                  disabled={aiLoading}
                  onClick={() => void fetchAiPlan()}
                >
                  {!aiLoading ? <Sparkles className="h-3.5 w-3.5" aria-hidden /> : null}
                  {aiLoading ? vp.aiPlanLoading : aiPlan ? vp.regenerateAiPlan : vp.getAiPlan}
                </Button>
              ) : null}

              <Button type="button" variant="secondary" className="!text-xs" onClick={handleOpenInChat}>
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                {vp.openInChat}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
