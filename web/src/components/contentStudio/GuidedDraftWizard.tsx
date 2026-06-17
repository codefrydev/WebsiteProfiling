'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { Button } from '@/components';
import type {
  WizardOption,
  WizardOptionsResult,
  WizardOutlineItem,
  WizardOutlineResult,
  WizardTitlesResult,
  WizardDraftResult,
} from '@/types/contentStudio';

const STEPS = ['intent', 'type', 'tone', 'title', 'outline'] as const;
type Step = (typeof STEPS)[number];

export interface GuidedDraftWizardProps {
  open: boolean;
  propertyId: number;
  locale?: string;
  initialKeyword?: string;
  onClose: () => void;
  onComplete: (draftId: number) => void;
}

interface OutlineRow extends WizardOutlineItem {
  uid: number;
}

async function callStep<T>(step: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl('/content/wizard'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Wizard step failed');
  return json.result as T;
}

let outlineUid = 0;
const withUid = (items: WizardOutlineItem[]): OutlineRow[] =>
  items.map((it) => ({ ...it, uid: ++outlineUid }));

export default function GuidedDraftWizard({
  open,
  propertyId,
  locale = 'en-US',
  initialKeyword = '',
  onClose,
  onComplete,
}: GuidedDraftWizardProps) {
  const w = strings.views.contentStudio.wizard;

  const [keyword, setKeyword] = useState(initialKeyword);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const [intentOptions, setIntentOptions] = useState<WizardOption[] | null>(null);
  const [typeOptions, setTypeOptions] = useState<WizardOption[] | null>(null);
  const [toneOptions, setToneOptions] = useState<WizardOption[] | null>(null);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [outline, setOutline] = useState<OutlineRow[] | null>(null);

  const [intent, setIntent] = useState('');
  const [contentType, setContentType] = useState('');
  const [tone, setTone] = useState('');
  const [title, setTitle] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const genRef = useRef(0);

  // Reset everything whenever the wizard is (re)opened.
  useEffect(() => {
    if (!open) return;
    setKeyword(initialKeyword);
    setStarted(Boolean(initialKeyword.trim()));
    setStepIdx(0);
    setIntentOptions(null);
    setTypeOptions(null);
    setToneOptions(null);
    setTitles(null);
    setOutline(null);
    setIntent('');
    setContentType('');
    setTone('');
    setTitle('');
    setError(null);
    setGenerating(false);
  }, [open, initialKeyword]);

  const step = STEPS[stepIdx];

  const load = useCallback(
    async (s: Step) => {
      const gen = ++genRef.current;
      setBusy(true);
      setError(null);
      try {
        if (s === 'intent') {
          const r = await callStep<WizardOptionsResult>('intents', { keyword, locale });
          if (gen === genRef.current) setIntentOptions(r.options || []);
        } else if (s === 'type') {
          const r = await callStep<WizardOptionsResult>('content_types', { keyword, intent });
          if (gen === genRef.current) setTypeOptions(r.options || []);
        } else if (s === 'tone') {
          const r = await callStep<WizardOptionsResult>('tones', { keyword, intent, contentType });
          if (gen === genRef.current) setToneOptions(r.options || []);
        } else if (s === 'title') {
          const r = await callStep<WizardTitlesResult>('titles', { keyword, intent, contentType, tone });
          if (gen === genRef.current) setTitles(r.titles || []);
        } else if (s === 'outline') {
          const r = await callStep<WizardOutlineResult>('outline', { keyword, intent, contentType, tone, title });
          if (gen === genRef.current) setOutline(withUid(r.outline || []));
        }
      } catch (e) {
        if (gen === genRef.current) setError(e instanceof Error ? e.message : 'AI request failed');
      } finally {
        if (gen === genRef.current) setBusy(false);
      }
    },
    [keyword, locale, intent, contentType, tone, title],
  );

  // Lazily fetch the data the current step needs.
  useEffect(() => {
    if (!open || !started) return;
    if (step === 'intent' && intentOptions === null) void load('intent');
    else if (step === 'type' && typeOptions === null) void load('type');
    else if (step === 'tone' && toneOptions === null) void load('tone');
    else if (step === 'title' && titles === null) void load('title');
    else if (step === 'outline' && outline === null) void load('outline');
  }, [open, started, step, intentOptions, typeOptions, toneOptions, titles, outline, load]);

  if (!open) return null;

  const selectIntent = (label: string) => {
    if (label !== intent) {
      setIntent(label);
      setTypeOptions(null);
      setToneOptions(null);
      setTitles(null);
      setOutline(null);
      setContentType('');
      setTone('');
      setTitle('');
    }
  };
  const selectType = (label: string) => {
    if (label !== contentType) {
      setContentType(label);
      setToneOptions(null);
      setTitles(null);
      setOutline(null);
      setTone('');
      setTitle('');
    }
  };
  const selectTone = (label: string) => {
    if (label !== tone) {
      setTone(label);
      setTitles(null);
      setOutline(null);
      setTitle('');
    }
  };
  const selectTitle = (value: string) => {
    if (value !== title) {
      setTitle(value);
      setOutline(null);
    }
  };

  const canAdvance =
    (step === 'intent' && Boolean(intent)) ||
    (step === 'type' && Boolean(contentType)) ||
    (step === 'tone' && Boolean(tone)) ||
    (step === 'title' && Boolean(title.trim())) ||
    step === 'outline';

  const goNext = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  const goBack = () => {
    if (stepIdx === 0) {
      setStarted(false);
    } else {
      setStepIdx((i) => i - 1);
    }
  };

  // --- outline editing ---
  const updateRow = (uid: number, text: string) =>
    setOutline((rows) => (rows ? rows.map((r) => (r.uid === uid ? { ...r, text } : r)) : rows));
  const deleteRow = (uid: number) =>
    setOutline((rows) => (rows ? rows.filter((r) => r.uid !== uid) : rows));
  const moveRow = (uid: number, dir: -1 | 1) =>
    setOutline((rows) => {
      if (!rows) return rows;
      const i = rows.findIndex((r) => r.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 1 || j >= rows.length) return rows; // never move above the h1
      const copy = [...rows];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const addRow = (level: 'h2' | 'h3') =>
    setOutline((rows) => [...(rows || []), { uid: ++outlineUid, level, text: w.newHeadingText }]);

  const generate = async () => {
    if (!outline) return;
    const gen = ++genRef.current;
    setGenerating(true);
    setError(null);
    try {
      const outlinePayload = outline.map(({ level, text }) => ({ level, text }));
      const draft = await callStep<WizardDraftResult>('draft', {
        keyword,
        intent,
        contentType,
        tone,
        title,
        outline: outlinePayload,
      });
      const res = await fetch(apiUrl('/content-drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          title: title.trim() || keyword.trim(),
          target_keyword: keyword.trim(),
          landing_url: null,
          body_html: draft.body_html || '',
          title_tag: draft.title_tag || '',
          meta_description: draft.meta_description || '',
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || w.createFailed);
      if (gen === genRef.current) onComplete(Number(payload.id));
    } catch (e) {
      if (gen === genRef.current) setError(e instanceof Error ? e.message : w.createFailed);
    } finally {
      if (gen === genRef.current) setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--chat-bg)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-default px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-link" aria-hidden />
            <h2 className="truncate text-sm font-semibold text-foreground">{w.title}</h2>
          </div>
          {keyword.trim() ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {keyword.trim()} · {locale}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
          aria-label={w.close}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {!started ? (
        <KeywordGate
          keyword={keyword}
          onChange={setKeyword}
          onStart={() => {
            if (keyword.trim()) setStarted(true);
          }}
        />
      ) : (
        <>
          <Stepper current={stepIdx} />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              {stepIdx > 0 && intent ? (
                <div className="mb-6 flex items-start gap-2 rounded-lg bg-[var(--chat-surface)]/60 px-4 py-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <p className="text-muted-foreground">
                    <span className="text-muted-foreground/80">{w.selectedIntent}</span>{' '}
                    <span className="text-foreground">{intent}</span>
                  </p>
                </div>
              ) : null}

              {error ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <span>{error}</span>
                  <Button type="button" variant="secondary" className="!px-2 !py-1 !text-xs" onClick={() => void load(step)}>
                    {w.retry}
                  </Button>
                </div>
              ) : null}

              {busy ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {w.loadingOptions}
                </div>
              ) : (
                <StepBody
                  step={step}
                  intentOptions={intentOptions}
                  typeOptions={typeOptions}
                  toneOptions={toneOptions}
                  titles={titles}
                  outline={outline}
                  intent={intent}
                  contentType={contentType}
                  tone={tone}
                  title={title}
                  onSelectIntent={selectIntent}
                  onSelectType={selectType}
                  onSelectTone={selectTone}
                  onSelectTitle={selectTitle}
                  onUpdateRow={updateRow}
                  onDeleteRow={deleteRow}
                  onMoveRow={moveRow}
                  onAddRow={addRow}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-default px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={goBack} disabled={generating}>
              {w.back}
            </Button>
            {step === 'outline' ? (
              <Button type="button" variant="primary" onClick={() => void generate()} loading={generating} disabled={!outline || outline.length === 0}>
                <Sparkles className="h-4 w-4" aria-hidden />
                {generating ? w.generating : w.generate}
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={goNext} disabled={!canAdvance || busy}>
                {w.next}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KeywordGate({
  keyword,
  onChange,
  onStart,
}: {
  keyword: string;
  onChange: (v: string) => void;
  onStart: () => void;
}) {
  const w = strings.views.contentStudio.wizard;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h3 className="text-xl font-semibold text-foreground">{w.keywordHeading}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{w.keywordSub}</p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onStart();
          }}
        >
          <input
            type="text"
            value={keyword}
            onChange={(e) => onChange(e.target.value)}
            placeholder={w.keywordPlaceholder}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-default bg-[var(--chat-surface)] px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={!keyword.trim()}>
            {w.start}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const labels = strings.views.contentStudio.wizard.steps;
  const order: Array<keyof typeof labels> = ['intent', 'type', 'tone', 'title', 'outline'];
  return (
    <div className="shrink-0 overflow-x-auto border-b border-default bg-[var(--chat-surface)]/30 px-4 sm:px-6">
      <ol className="mx-auto flex w-full max-w-4xl items-center">
        {order.map((key, i) => {
          const active = i === current;
          const done = i < current;
          return (
            <li key={key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2 py-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    active
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'bg-green-600 text-white'
                        : 'bg-brand-700 text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`whitespace-nowrap text-xs font-medium ${active ? 'text-link' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {labels[key]}
                </span>
              </div>
              {i < order.length - 1 ? <ChevronRight className="mx-2 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface StepBodyProps {
  step: Step;
  intentOptions: WizardOption[] | null;
  typeOptions: WizardOption[] | null;
  toneOptions: WizardOption[] | null;
  titles: string[] | null;
  outline: OutlineRow[] | null;
  intent: string;
  contentType: string;
  tone: string;
  title: string;
  onSelectIntent: (v: string) => void;
  onSelectType: (v: string) => void;
  onSelectTone: (v: string) => void;
  onSelectTitle: (v: string) => void;
  onUpdateRow: (uid: number, text: string) => void;
  onDeleteRow: (uid: number) => void;
  onMoveRow: (uid: number, dir: -1 | 1) => void;
  onAddRow: (level: 'h2' | 'h3') => void;
}

function StepBody(props: StepBodyProps) {
  const w = strings.views.contentStudio.wizard;
  const { step } = props;

  if (step === 'intent') {
    return (
      <OptionList
        heading={w.intentHeading}
        sub={w.intentSub}
        options={props.intentOptions}
        selected={props.intent}
        onSelect={props.onSelectIntent}
      />
    );
  }
  if (step === 'type') {
    return (
      <OptionList
        heading={w.typeHeading}
        sub={w.typeSub}
        options={props.typeOptions}
        selected={props.contentType}
        onSelect={props.onSelectType}
      />
    );
  }
  if (step === 'tone') {
    return (
      <OptionList
        heading={w.toneHeading}
        sub={w.toneSub}
        options={props.toneOptions}
        selected={props.tone}
        onSelect={props.onSelectTone}
      />
    );
  }
  if (step === 'title') {
    return (
      <TitleStep titles={props.titles} title={props.title} onSelect={props.onSelectTitle} />
    );
  }
  return (
    <OutlineStep
      outline={props.outline}
      onUpdateRow={props.onUpdateRow}
      onDeleteRow={props.onDeleteRow}
      onMoveRow={props.onMoveRow}
      onAddRow={props.onAddRow}
    />
  );
}

function OptionList({
  heading,
  sub,
  options,
  selected,
  onSelect,
}: {
  heading: string;
  sub: string;
  options: WizardOption[] | null;
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <h3 className="text-2xl font-bold text-foreground">{heading}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      <div className="mt-6 space-y-2">
        {(options || []).map((opt) => {
          const active = opt.label === selected;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onSelect(opt.label)}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/40'
                  : 'border-default hover:border-default/80 hover:bg-[var(--chat-surface)]/40'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground/50'
                }`}
              >
                {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                {opt.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TitleStep({
  titles,
  title,
  onSelect,
}: {
  titles: string[] | null;
  title: string;
  onSelect: (v: string) => void;
}) {
  const w = strings.views.contentStudio.wizard;
  return (
    <div>
      <h3 className="text-2xl font-bold text-foreground">{w.titleHeading}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{w.titleSub}</p>
      <div className="mt-6 space-y-2">
        {(titles || []).map((t) => {
          const active = t === title;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(t)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/40 text-foreground'
                  : 'border-default text-foreground hover:bg-[var(--chat-surface)]/40'
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
      <label className="mt-6 block text-xs text-muted-foreground">
        {w.titleCustomLabel}
        <input
          type="text"
          value={title}
          onChange={(e) => onSelect(e.target.value)}
          placeholder={w.titleCustomPlaceholder}
          className="mt-1 w-full rounded-lg border border-default bg-[var(--chat-surface)] px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none"
        />
      </label>
    </div>
  );
}

function OutlineStep({
  outline,
  onUpdateRow,
  onDeleteRow,
  onMoveRow,
  onAddRow,
}: {
  outline: OutlineRow[] | null;
  onUpdateRow: (uid: number, text: string) => void;
  onDeleteRow: (uid: number) => void;
  onMoveRow: (uid: number, dir: -1 | 1) => void;
  onAddRow: (level: 'h2' | 'h3') => void;
}) {
  const w = strings.views.contentStudio.wizard;
  return (
    <div>
      <h3 className="text-2xl font-bold text-foreground">{w.outlineHeading}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{w.outlineSub}</p>
      <div className="mt-6 space-y-2 rounded-xl border border-default p-3">
        {(outline || []).map((row, i) => (
          <div
            key={row.uid}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
              row.level === 'h1' ? '' : row.level === 'h3' ? 'ml-8' : 'ml-4'
            }`}
          >
            <span className="w-7 shrink-0 text-center text-[10px] font-semibold uppercase text-muted-foreground">
              {row.level}
            </span>
            <input
              type="text"
              value={row.text}
              onChange={(e) => onUpdateRow(row.uid, e.target.value)}
              disabled={row.level === 'h1'}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-foreground hover:border-default focus:border-blue-500 focus:bg-[var(--chat-surface)] focus:outline-none disabled:opacity-80"
            />
            {row.level !== 'h1' ? (
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveRow(row.uid, -1)}
                  disabled={i <= 1}
                  className="rounded p-1 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground disabled:opacity-30"
                  aria-label={w.moveUp}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveRow(row.uid, 1)}
                  disabled={i >= (outline?.length || 0) - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground disabled:opacity-30"
                  aria-label={w.moveDown}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRow(row.uid)}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  aria-label={w.deleteHeading}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ) : null}
          </div>
        ))}
        <div className="flex gap-2 pl-9 pt-1">
          <button
            type="button"
            onClick={() => onAddRow('h2')}
            className="flex items-center gap-1 text-xs text-link hover:underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {w.addH2}
          </button>
          <button
            type="button"
            onClick={() => onAddRow('h3')}
            className="flex items-center gap-1 text-xs text-link hover:underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {w.addH3}
          </button>
        </div>
      </div>
    </div>
  );
}
