
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DraftInput } from '@/components/shared/DraftTextInput';
import {
  type ChatFabCorner,
  loadChatFabCorner,
  saveChatFabCorner,
} from '@/lib/chatFabPosition';
import {
  DEFAULT_CHAT_ASSISTANT_NAME,
  DEFAULT_CHAT_ASSISTANT_AVATAR,
} from '@/lib/chatAssistantBranding';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { llmSettingsDtoToFlatState, type LlmSettingsGetResponse } from '@/lib/llmSettingsMapper';
import { strings } from '@/lib/strings';

const s = strings.settings;

// ─── Shared Toggle component ─────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
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

// ─── Row wrapper ─────────────────────────────────────────────────────────────

function Row({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-bright cursor-pointer">
          {label}
        </label>
        {help && <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>}
      </div>
      <div className="flex-shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

// ─── FAB corner picker ────────────────────────────────────────────────────────

const CORNER_OPTIONS: { value: ChatFabCorner; label: string }[] = [
  { value: 'bottom-right', label: s.fabCornerBottomRight },
  { value: 'bottom-left', label: s.fabCornerBottomLeft },
  { value: 'top-right', label: s.fabCornerTopRight },
  { value: 'top-left', label: s.fabCornerTopLeft },
];

// ─── DB-backed chat settings ─────────────────────────────────────────────────

interface ChatLlmState {
  llm_chat_assistant_name: string;
  llm_chat_assistant_avatar_url: string;
  llm_chat_unlimited_tool_rounds: boolean;
}

async function loadChatLlmSettings(): Promise<ChatLlmState | null> {
  try {
    const res = await apiFetch(apiUrl('/llm-settings'));
    if (!res.ok) return null;
    const data = (await res.json()) as LlmSettingsGetResponse;
    if (!data.settings) return null;
    const flat = llmSettingsDtoToFlatState(data.settings);
    return {
      llm_chat_assistant_name: String(flat.llm_chat_assistant_name ?? ''),
      llm_chat_assistant_avatar_url: String(flat.llm_chat_assistant_avatar_url ?? ''),
      llm_chat_unlimited_tool_rounds: Boolean(flat.llm_chat_unlimited_tool_rounds),
    };
  } catch {
    return null;
  }
}

async function saveChatLlmField(key: string, value: string | boolean): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = {};
    if (key === 'llm_chat_assistant_name') patch.chatAssistantName = String(value);
    if (key === 'llm_chat_assistant_avatar_url') patch.chatAssistantAvatarUrl = String(value);
    if (key === 'llm_chat_unlimited_tool_rounds') patch.chatUnlimitedToolRounds = Boolean(value);
    const res = await apiFetch(apiUrl('/llm-settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: patch }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ChatSettingsPanel() {
  const [fabCorner, setFabCornerState] = useState<ChatFabCorner>('bottom-right');
  const [assistantName, setAssistantName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [unlimitedTools, setUnlimitedTools] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setFabCornerState(loadChatFabCorner());
    void loadChatLlmSettings().then((state) => {
      if (!state) {
        setLoadError('Could not load chat settings from database.');
        return;
      }
      setAssistantName(state.llm_chat_assistant_name);
      setAvatarUrl(state.llm_chat_assistant_avatar_url);
      setUnlimitedTools(state.llm_chat_unlimited_tool_rounds);
    });
  }, []);

  const showSave = (ok: boolean) => {
    setSaveStatus(ok ? 'saved' : 'error');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleFabCorner = (corner: ChatFabCorner) => {
    setFabCornerState(corner);
    saveChatFabCorner(corner);
  };

  const commitAssistantName = useCallback((value: string) => {
    setAssistantName(value);
    setSaveStatus('saving');
    void saveChatLlmField('llm_chat_assistant_name', value).then(showSave);
  }, []);

  const commitAvatarUrl = useCallback((value: string) => {
    setAvatarUrl(value);
    setSaveStatus('saving');
    void saveChatLlmField('llm_chat_assistant_avatar_url', value).then(showSave);
  }, []);

  const handleUnlimitedTools = (value: boolean) => {
    setUnlimitedTools(value);
    setSaveStatus('saving');
    void saveChatLlmField('llm_chat_unlimited_tool_rounds', value).then(showSave);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-bright">{s.chatSection}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{s.chatSubtitle}</p>
        </div>
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {s.chatSaving}
          </div>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-[var(--accent)]">{s.chatSaved}</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-500 dark:text-red-400">{s.chatSaveError}</span>
        )}
      </div>

      {loadError && (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {loadError}
        </p>
      )}

      {/* FAB position (synced via client_preferences) */}
      <section className="mb-6 rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <p className="mb-3 text-sm font-medium text-bright">{s.fabCornerLabel}</p>
        <p className="mb-3 text-xs text-muted-foreground">{s.fabCornerHelp}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CORNER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleFabCorner(value)}
              aria-pressed={fabCorner === value}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                fabCorner === value
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
                  : 'border-default text-muted-foreground hover:border-[var(--accent)] hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* DB-backed settings */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] divide-y divide-[var(--app-border-muted)]">
        {/* Assistant name */}
        <div className="px-5 py-4">
          <label
            htmlFor="assistant-name"
            className="block text-sm font-medium text-bright"
          >
            {s.assistantNameLabel}
          </label>
          <DraftInput
            id="assistant-name"
            type="text"
            value={assistantName}
            placeholder={DEFAULT_CHAT_ASSISTANT_NAME}
            onCommit={commitAssistantName}
            className="mt-2 w-full rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--accent)] focus:outline-none transition-colors"
          />
        </div>

        {/* Assistant avatar */}
        <div className="px-5 py-4">
          <label
            htmlFor="assistant-avatar"
            className="block text-sm font-medium text-bright"
          >
            {s.assistantAvatarLabel}
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.assistantAvatarHelp}</p>
          <DraftInput
            id="assistant-avatar"
            type="text"
            value={avatarUrl}
            placeholder={DEFAULT_CHAT_ASSISTANT_AVATAR}
            onCommit={commitAvatarUrl}
            className="mt-2 w-full rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
          />
        </div>

        {/* Unlimited tool rounds */}
        <Row
          htmlFor="unlimited-tools-toggle"
          label={s.unlimitedToolRoundsLabel}
          help={s.unlimitedToolRoundsHelp}
        >
          <Toggle
            id="unlimited-tools-toggle"
            checked={unlimitedTools}
            onChange={handleUnlimitedTools}
            disabled={saveStatus === 'saving'}
          />
        </Row>
      </section>

      <p className="mt-4 text-[11px] text-muted-foreground">
        FAB position is saved to this browser. Assistant name, avatar, and tool rounds are saved to the database.
      </p>
    </div>
  );
}
