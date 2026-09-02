
import { useState } from 'react';
import { X, Sparkles, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  generateWidgetScript,
  generateWidget,
  generateDashboard,
  AiGenerateError,
  type AiScriptResult,
} from '@/lib/dashboard/ai/generate';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import type { Widget, DashboardDoc, WidgetBinding, WidgetOptions } from '@/lib/dashboard/types';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type AiMode = 'script' | 'widget' | 'dashboard';

interface AiAssistModalBaseProps {
  propertyId?: number;
  reportId?: number | null;
  onClose: () => void;
}

interface ScriptModeProps extends AiAssistModalBaseProps {
  mode: 'script';
  toolName: string;
  currentBinding: WidgetBinding;
  currentOptions: WidgetOptions;
  onApplyScript: (result: AiScriptResult) => void;
}

interface WidgetModeProps extends AiAssistModalBaseProps {
  mode: 'widget';
  bottomY?: number;
  onAddWidget: (widget: Widget) => void;
}

interface DashboardModeProps extends AiAssistModalBaseProps {
  mode: 'dashboard';
  onCreateDashboard: (name: string, doc: DashboardDoc) => void;
}

export type AiAssistModalProps = ScriptModeProps | WidgetModeProps | DashboardModeProps;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<AiMode, string> = {
  script: 'Improve script',
  widget: 'Generate widget',
  dashboard: 'Generate dashboard',
};

const PLACEHOLDERS: Record<AiMode, string> = {
  script: 'e.g. "Show me the ratio of 4xx to total URLs as a percentage" or "Only count critical issues"',
  widget: 'e.g. "Show top 10 broken links by page" or "KPI card for overall health score"',
  dashboard: 'e.g. "Performance-focused dashboard with Core Web Vitals and Lighthouse scores"',
};

export default function AiAssistModal(props: AiAssistModalProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);
  const [pending, setPending] = useState<{
    script?: AiScriptResult;
    widget?: Widget;
    dashboard?: { name: string; doc: DashboardDoc };
  } | null>(null);

  const { mode, propertyId, reportId, onClose } = props;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setPending(null);
    setExplanation(null);

    try {
      if (mode === 'script') {
        const sp = props as ScriptModeProps;
        const result = await generateWidgetScript(prompt, {
          toolName: sp.toolName,
          propertyId,
          reportId,
          current: { binding: sp.currentBinding, options: sp.currentOptions },
        });
        setPending({ script: result });
        setExplanation(result.explanation);
      } else if (mode === 'widget') {
        const wp = props as WidgetModeProps;
        const { widget, explanation: expl } = await generateWidget(
          prompt,
          { propertyId, reportId },
          wp.bottomY ?? 0,
        );
        setPending({ widget });
        setExplanation(expl);
      } else {
        const { name, doc, explanation: expl } = await generateDashboard(
          prompt,
          { propertyId, reportId },
        );
        setPending({ dashboard: { name, doc } });
        setExplanation(expl);
      }
    } catch (e) {
      if (e instanceof AiGenerateError && e.missing) {
        setError('AI insights are disabled. Enable them in Settings → AI insights.');
      } else {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!pending) return;
    if (mode === 'script' && pending.script) {
      (props as ScriptModeProps).onApplyScript(pending.script);
      onClose();
    } else if (mode === 'widget' && pending.widget) {
      (props as WidgetModeProps).onAddWidget(pending.widget);
      onClose();
    } else if (mode === 'dashboard' && pending.dashboard) {
      const dp = props as DashboardModeProps;
      dp.onCreateDashboard(pending.dashboard.name, pending.dashboard.doc);
      onClose();
    }
  };

  useModalDismiss({
    onDismiss: onClose,
    lockScroll: true,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bg-brand-800 border border-default rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assist-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-link" />
            <h2 id="ai-assist-title" className="font-bold text-foreground text-sm">{MODE_LABELS[mode]}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-brand-700/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              What do you want?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={PLACEHOLDERS[mode]}
              className="w-full px-3 py-2 text-sm bg-brand-800 border border-default rounded-lg text-bright placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleGenerate();
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">⌘↵ to generate</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {explanation && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowExplanation((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span>AI explanation</span>
                {showExplanation ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showExplanation && (
                <p className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{explanation}</p>
              )}
            </div>
          )}

          {pending?.script && (
            <ScriptPreview result={pending.script} />
          )}

          {pending?.widget && (
            <WidgetPreview widget={pending.widget} />
          )}

          {pending?.dashboard && (
            <DashboardPreview name={pending.dashboard.name} doc={pending.dashboard.doc} />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-default shrink-0 flex gap-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="flex items-center justify-center gap-2 flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? (
              <><span className="animate-spin">⟳</span> Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Generate</>
            )}
          </button>
          {pending && (
            <button
              onClick={handleApply}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
            >
              Apply
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-default hover:bg-brand-700/80 text-sm text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Previews
// ──────────────────────────────────────────────────────────────────────────────

function ScriptPreview({ result }: { result: AiScriptResult }) {
  return (
    <div className="space-y-2">
      {result.measure && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Measure</p>
          <pre className="text-xs font-mono bg-brand-950/80 rounded px-2 py-1.5 text-blue-300 whitespace-pre-wrap overflow-x-auto">{result.measure}</pre>
        </div>
      )}
      {result.transform && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Transform</p>
          <pre className="text-xs font-mono bg-brand-950/80 rounded px-2 py-1.5 text-blue-300 whitespace-pre-wrap overflow-x-auto">{result.transform}</pre>
        </div>
      )}
      {result.chartSpec && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Chart spec (type: {result.chartSpec.type})</p>
          <pre className="text-[10px] font-mono bg-brand-950/80 rounded px-2 py-1.5 text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-32">{JSON.stringify(result.chartSpec, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function WidgetPreview({ widget }: { widget: Widget }) {
  return (
    <div className="rounded-lg border border-default bg-brand-800/40 px-3 py-2 space-y-1">
      <p className="text-xs font-semibold text-bright">{widget.title}</p>
      <p className="text-[10px] text-muted-foreground">
        <span className="text-blue-400">{widget.viz}</span> · {widget.binding.toolName}
      </p>
      {widget.binding.valueField && (
        <p className="text-[10px] text-muted-foreground">Value: {widget.binding.valueField}</p>
      )}
    </div>
  );
}

function DashboardPreview({ name, doc }: { name: string; doc: DashboardDoc }) {
  return (
    <div className="rounded-lg border border-default bg-brand-800/40 px-3 py-2 space-y-2">
      <p className="text-xs font-semibold text-bright">{name}</p>
      <p className="text-[10px] text-muted-foreground">{doc.widgets.length} widget{doc.widgets.length !== 1 ? 's' : ''}</p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {doc.widgets.map((w) => (
          <div key={w.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="text-blue-400 shrink-0">{w.viz}</span>
            <span className="truncate">{w.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
