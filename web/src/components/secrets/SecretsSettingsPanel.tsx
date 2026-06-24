
import { Link } from 'react-router-dom';
import ConfigField from '@/components/pipeline/ConfigField';
import { SECRETS_SECTIONS, type SecretsField, type SecretsSection } from '@/lib/secretsConfigSchema';
import { integrationGuideHref } from '@/lib/docs/integrationGuides';
import { strings } from '@/lib/strings';
import type { SecretsState } from '@/types/api';

const s = strings.secrets;

function envHintsForSection(section: SecretsSection, envHints: Record<string, boolean>) {
  const names: string[] = [];
  for (const field of section.fields) {
    for (const envVar of field.envVars ?? []) {
      if (envHints[envVar]) names.push(envVar);
    }
  }
  return names;
}

function toConfigField(field: SecretsField) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    help: field.help,
    placeholder: field.placeholder,
  };
}

export interface SecretsSettingsPanelProps {
  activeSection: SecretsSection['id'];
  state: SecretsState;
  envHints: Record<string, boolean>;
  disabled?: boolean;
  onChange: (key: string, value: string | boolean) => void;
}

export default function SecretsSettingsPanel({
  activeSection,
  state,
  envHints,
  disabled,
  onChange,
}: SecretsSettingsPanelProps) {
  const section = SECRETS_SECTIONS.find((sec) => sec.id === activeSection);
  if (!section) return null;

  const activeEnvHints = envHintsForSection(section, envHints);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {activeEnvHints.length ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
          {s.envConfigured}: {activeEnvHints.join(', ')}
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-muted/30 bg-[var(--chat-surface)] p-5 sm:p-6">
        {section.fields.map((field) => {
          if (field.key === 'google_service_account_json' && state.google_service_account_json_masked) {
            return (
              <div key={field.key} className="space-y-2">
                <p className="text-sm font-medium text-foreground">{field.label}</p>
                {field.help ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{field.help}</p>
                ) : null}
                <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {s.serviceAccountSaved}
                </p>
                <textarea
                  rows={4}
                  disabled={disabled}
                  placeholder={s.serviceAccountReplacePlaceholder}
                  value={String(state[field.key] || '') === '{configured}' ? '' : String(state[field.key] || '')}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="w-full rounded-lg border border-default bg-[var(--chat-bg)] px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none"
                />
              </div>
            );
          }

          return (
            <ConfigField
              key={field.key}
              field={toConfigField(field)}
              value={state[field.key]}
              disabled={disabled}
              onChange={(value) => onChange(field.key, value)}
            />
          );
        })}
      </div>

      {section.id === 'google' ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {s.googleConnectHint}{' '}
            <Link to="/pipeline?group=google" className="text-link hover:underline">
              {s.googleConnectLink}
            </Link>
          </p>
          <p>
            <Link
              to={integrationGuideHref('google', { from: 'secrets', sectionId: 'oauthClient' })}
              className="text-link hover:underline"
            >
              {strings.docs.googleOAuthGuideLink}
            </Link>
          </p>
        </div>
      ) : null}

      {section.id === 'ai' ? (
        <p className="text-xs text-muted-foreground">
          {s.aiProviderHint}{' '}
          <Link to="/pipeline?group=content-ai" className="text-link hover:underline">
            {s.aiProviderLink}
          </Link>
          {' · '}
          <Link to={integrationGuideHref('ai', { from: 'secrets' })} className="text-link hover:underline">
            {strings.docs.setupGuideLink}
          </Link>
        </p>
      ) : null}

      {section.id === 'integrations' ? (
        <p className="text-xs text-muted-foreground">
          <Link to={integrationGuideHref('bing', { from: 'secrets' })} className="text-link hover:underline">
            {strings.docs.bingGuideLink}
          </Link>
          {' · '}
          <Link to={integrationGuideHref('serp', { from: 'secrets' })} className="text-link hover:underline">
            {strings.docs.serpGuideLink}
          </Link>
        </p>
      ) : null}

      {section.id === 'crawl' ? (
        <p className="text-xs text-muted-foreground">
          <Link to={integrationGuideHref('crawl-auth', { from: 'secrets' })} className="text-link hover:underline">
            {strings.docs.setupGuideLink}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function SecretsSaveBar({
  saving,
  loading,
  saveMsg,
  readOnly,
  onSave,
  saveHint,
  saveButton,
  savingLabel,
}: {
  saving: boolean;
  loading: boolean;
  saveMsg: string;
  readOnly: boolean;
  onSave: () => void;
  saveHint?: string;
  saveButton?: string;
  savingLabel?: string;
}) {
  const saveFailed = saveMsg && !saveMsg.includes('saved');
  const hint = saveHint ?? s.saveHint;
  const buttonLabel = readOnly ? strings.app.readonlyBanner : saving ? (savingLabel ?? s.saving) : (saveButton ?? s.saveButton);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <span
        className={`text-sm ${saveMsg ? (saveFailed ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400') : 'text-xs text-muted-foreground'}`}
      >
        {saveMsg || hint}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || loading || readOnly}
        className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
