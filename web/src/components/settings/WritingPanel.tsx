
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { strings } from '@/lib/strings';

const s = strings.settings;

const CONTENT_STUDIO_AI_KEY = 'content-studio-ai-enabled';

function loadContentStudioAi(): boolean {
  try {
    const raw = localStorage.getItem(CONTENT_STUDIO_AI_KEY);
    if (raw === '0') return false;
    return true; // default on
  } catch {
    return true;
  }
}

function saveContentStudioAi(value: boolean): void {
  try {
    localStorage.setItem(CONTENT_STUDIO_AI_KEY, value ? '1' : '0');
  } catch { /* ignore */ }
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--app-bg-sunken)]'
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function WritingPanel() {
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    setAiEnabled(loadContentStudioAi());
  }, []);

  const handleAiToggle = (value: boolean) => {
    setAiEnabled(value);
    saveContentStudioAi(value);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-bright">{s.writingSection}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.writingSubtitle}</p>
      </div>

      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] divide-y divide-[var(--app-border-muted)]">
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="content-studio-ai-toggle"
              className="block text-sm font-medium text-bright cursor-pointer"
            >
              {s.contentStudioAiLabel}
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.contentStudioAiHelp}</p>
          </div>
          <div className="flex-shrink-0 pt-0.5">
            <Toggle
              id="content-studio-ai-toggle"
              checked={aiEnabled}
              onChange={handleAiToggle}
            />
          </div>
        </div>
      </section>

      <p className="mt-4 text-[11px] text-muted-foreground">
        This preference is saved to your browser only. The server-side AI gate for Content Studio is on the{' '}
        <Link to="/pipeline?group=content-ai" className="text-link hover:underline underline-offset-2">
          Pipeline → Content & AI
        </Link>{' '}
        page.
      </p>
    </div>
  );
}
