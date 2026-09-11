
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
      className={`press relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-md-sys-primary border-md-sys-primary' : 'bg-md-sys-surface-container-highest border-md-sys-outline'
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none block h-5 w-5 rounded-full shadow-xs ring-0 transition-transform ${
          checked ? 'translate-x-5 bg-md-sys-on-primary' : 'translate-x-0 bg-md-sys-outline'
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
        <label htmlFor={htmlFor} className="block text-sm font-medium text-md-sys-on-surface cursor-pointer">
          {label}
        </label>
        {help && <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{help}</p>}
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
          <h1 className="text-xl font-semibold text-md-sys-on-surface">{s.chatSection}</h1>
          <p className="mt-1 text-sm text-md-sys-on-surface-variant">{s.chatSubtitle}</p>
        </div>
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-xs text-md-sys-on-surface-variant">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {s.chatSaving}
          </div>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-md-sys-primary font-medium">{s.chatSaved}</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-md-sys-error font-medium">{s.chatSaveError}</span>
        )}
      </div>

      {loadError && (
        <p className="mb-6 rounded-2xl border border-md-sys-error/30 bg-md-sys-error-container/30 px-4 py-3 text-sm text-md-sys-on-error-container">
          {loadError}
        </p>
      )}

      {/* FAB position (synced via client_preferences) */}
      <section className="mb-6 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-5">
        <p className="mb-3 text-sm font-medium text-md-sys-on-surface">{s.fabCornerLabel}</p>
        <p className="mb-3 text-xs text-md-sys-on-surface-variant">{s.fabCornerHelp}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CORNER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleFabCorner(value)}
              aria-pressed={fabCorner === value}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95 ${
                fabCorner === value
                  ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary font-semibold'
                  : 'border-md-sys-outline-variant/40 text-md-sys-on-surface-variant hover:border-md-sys-primary/50 hover:text-md-sys-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* DB-backed settings */}
      <section className="rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container divide-y divide-md-sys-outline-variant/40">
        {/* Assistant name */}
        <div className="px-5 py-4">
          <label
            htmlFor="assistant-name"
            className="block text-sm font-medium text-md-sys-on-surface"
          >
            {s.assistantNameLabel}
          </label>
          <DraftInput
            id="assistant-name"
            type="text"
            value={assistantName}
            placeholder={DEFAULT_CHAT_ASSISTANT_NAME}
            onCommit={commitAssistantName}
            className="mt-2 w-full rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-high px-3 py-2 text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 focus:border-md-sys-primary focus:ring-2 focus:ring-md-sys-primary/20 focus:outline-none transition-all"
          />
        </div>

        {/* Assistant avatar */}
        <div className="px-5 py-4">
          <label
            htmlFor="assistant-avatar"
            className="block text-sm font-medium text-md-sys-on-surface"
          >
            {s.assistantAvatarLabel}
          </label>
          <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{s.assistantAvatarHelp}</p>
          <DraftInput
            id="assistant-avatar"
            type="text"
            value={avatarUrl}
            placeholder={DEFAULT_CHAT_ASSISTANT_AVATAR}
            onCommit={commitAvatarUrl}
            className="mt-2 w-full rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-high px-3 py-2 text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 font-mono focus:border-md-sys-primary focus:ring-2 focus:ring-md-sys-primary/20 focus:outline-none transition-all"
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

      <p className="mt-4 text-[11px] text-md-sys-on-surface-variant">
        FAB position is saved to this browser. Assistant name, avatar, and tool rounds are saved to the database.
      </p>
    </div>
  );
}
