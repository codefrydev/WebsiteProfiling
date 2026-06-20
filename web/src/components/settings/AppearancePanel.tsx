'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/useTheme';
import {
  THEME_TOKENS,
  THEME_PRESETS,
  TOKEN_GROUPS,
  type ThemeToken,
} from '@/lib/themeTokens';
import {
  type RadiusScale,
  type DensityScale,
  type FontSizeScale,
  type UiPrefs,
  RADIUS_SCALES,
  DENSITY_SCALES,
  FONT_SIZE_SCALES,
  DEFAULT_UI_PREFS,
  applyUiPrefs,
  getStoredUiPrefs,
  loadUiPrefsFromDb,
  saveUiPrefsToDb,
} from '@/lib/uiPrefsTokens';
import { strings } from '@/lib/strings';

const s = strings.settings;

// ─── Live preview card ────────────────────────────────────────────────────────

function PreviewCard() {
  return (
    <div
      className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5 shadow-sm"
      aria-label={s.previewLabel}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {s.previewLabel}
      </p>
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-bright">Heading text</h2>
          <p className="text-sm text-foreground">Body text rendered with your current palette.</p>
          <p className="text-xs text-muted-foreground">Subtle / muted text for secondary info.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            Primary button
          </button>
          <button
            type="button"
            className="rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--app-bg-sunken)]"
          >
            Secondary
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--accent)' }} />
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--accent-warm)' }} />
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--accent-2)' }} />
          <a href="#" className="text-xs text-link underline-offset-2 hover:underline" onClick={(e) => e.preventDefault()}>
            Link color
          </a>
        </div>
        <div className="rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-2 text-xs text-foreground">
          Muted surface / card background
        </div>
      </div>
    </div>
  );
}

// ─── Single token row ─────────────────────────────────────────────────────────

interface TokenRowProps {
  token: ThemeToken;
  editDark: boolean;
  overrideValue: string | undefined;
  onSet: (cssVar: string, value: string) => void;
  onReset: (cssVar: string) => void;
}

function TokenRow({ token, editDark, overrideValue, onSet, onReset }: TokenRowProps) {
  const defaultVal = editDark ? token.defaultDark : token.defaultLight;
  const displayed = overrideValue ?? defaultVal;
  const isCustom = overrideValue !== undefined && overrideValue !== '';

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Color swatch + native picker */}
      <label
        className="relative flex-shrink-0 cursor-pointer"
        title={`Edit ${token.label}`}
        aria-label={`Edit ${token.label}`}
      >
        <span
          className="block h-7 w-7 rounded-lg border border-default shadow-sm transition-transform hover:scale-110"
          style={{ background: displayed }}
        />
        <input
          type="color"
          value={displayed}
          className="sr-only"
          aria-label={token.label}
          onChange={(e) => onSet(token.cssVar, e.target.value)}
        />
      </label>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-bright truncate">{token.label}</span>
          {isCustom && (
            <span className="rounded-full bg-[var(--accent-bg)] px-1.5 py-px text-[10px] font-medium text-[var(--accent)]">
              {s.customizedBadge}
            </span>
          )}
        </div>
        <code className="block text-[10px] text-muted-foreground">{token.cssVar}</code>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="text"
          value={displayed}
          maxLength={9}
          className="w-20 rounded-lg border border-default bg-[var(--app-bg-muted)] px-2 py-1 text-[11px] font-mono text-foreground transition-colors focus:border-[var(--accent)] focus:outline-none"
          aria-label={`${token.label} hex value`}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,8}$/.test(v)) onSet(token.cssVar, v);
          }}
        />
        {isCustom && (
          <button
            type="button"
            title={s.resetTokenLabel}
            aria-label={`${s.resetTokenLabel}: ${token.label}`}
            onClick={() => onReset(token.cssVar)}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-[var(--app-bg-muted)] hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Preset pill button ───────────────────────────────────────────────────────

interface PresetPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function PresetPill({ label, active, onClick }: PresetPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
          : 'border-default text-muted-foreground hover:border-[var(--accent)] hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

// ─── UI Prefs section (radius / density / animations) ─────────────────────────

function UiPrefsSection() {
  const [prefs, setPrefs] = useState<UiPrefs>(() => ({ ...DEFAULT_UI_PREFS }));

  // Load from localStorage immediately, then from DB
  useEffect(() => {
    const local = getStoredUiPrefs();
    setPrefs(local);
    applyUiPrefs(local);

    void loadUiPrefsFromDb().then((db) => {
      if (!db) return;
      setPrefs(db);
      applyUiPrefs(db);
    });
  }, []);

  const update = (patch: Partial<UiPrefs>) => {
    const next: UiPrefs = { ...prefs, ...patch };
    setPrefs(next);
    applyUiPrefs(next);
    void saveUiPrefsToDb(next);
  };

  const RADIUS_LABELS: Record<RadiusScale, string> = {
    sharp: 'Sharp',
    default: 'Default',
    rounded: 'Rounded',
    pill: 'Pill',
  };

  const DENSITY_LABELS: Record<DensityScale, string> = {
    compact: 'Compact',
    default: 'Default',
    spacious: 'Spacious',
  };

  const FONT_SIZE_LABELS: Record<FontSizeScale, string> = {
    small: 'Small (15px)',
    default: 'Default (18px)',
    large: 'Large (20px)',
  };

  return (
    <div className="space-y-6">
      {/* Border radius */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <p className="mb-1 text-sm font-medium text-bright">Corner radius</p>
        <p className="mb-3 text-xs text-muted-foreground">Controls how rounded buttons, cards, and inputs appear.</p>
        <div className="flex flex-wrap gap-2">
          {RADIUS_SCALES.map((scale) => (
            <PresetPill
              key={scale}
              label={RADIUS_LABELS[scale]}
              active={prefs.radius === scale}
              onClick={() => update({ radius: scale })}
            />
          ))}
        </div>
        {/* Mini radius preview */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-9 w-24 border border-default bg-[var(--app-bg-muted)] flex items-center justify-center text-xs text-muted-foreground"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            Card
          </div>
          <div
            className="px-4 py-1.5 text-xs font-medium text-white"
            style={{ background: 'var(--accent)', borderRadius: 'var(--radius-lg)' }}
          >
            Button
          </div>
          <div
            className="h-7 w-24 border border-default bg-[var(--app-bg-muted)]"
            style={{ borderRadius: 'var(--radius-sm)' }}
          />
        </div>
      </section>

      {/* Density */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <p className="mb-1 text-sm font-medium text-bright">Layout density</p>
        <p className="mb-3 text-xs text-muted-foreground">Adjusts page padding and card spacing throughout the app.</p>
        <div className="flex flex-wrap gap-2">
          {DENSITY_SCALES.map((scale) => (
            <PresetPill
              key={scale}
              label={DENSITY_LABELS[scale]}
              active={prefs.density === scale}
              onClick={() => update({ density: scale })}
            />
          ))}
        </div>
      </section>

      {/* Font size */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <p className="mb-1 text-sm font-medium text-bright">Base font size</p>
        <p className="mb-3 text-xs text-muted-foreground">Scales the reading size across the entire interface.</p>
        <div className="flex flex-wrap gap-2">
          {FONT_SIZE_SCALES.map((scale) => (
            <PresetPill
              key={scale}
              label={FONT_SIZE_LABELS[scale]}
              active={prefs.fontSize === scale}
              onClick={() => update({ fontSize: scale })}
            />
          ))}
        </div>
        <p
          className="mt-4 rounded-lg bg-[var(--app-bg-muted)] px-3 py-1.5 text-xs text-muted-foreground"
          style={{ fontSize: 'var(--font-size-base)' }}
        >
          Preview — this line uses your selected font size.
        </p>
      </section>

      {/* Animations */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-bright">Animations</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Disable transitions and motion effects across the interface.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.animations}
            onClick={() => update({ animations: !prefs.animations })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              prefs.animations ? 'bg-[var(--accent)]' : 'bg-[var(--app-bg-muted)]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                prefs.animations ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AppearancePanel() {
  const { effectiveDark, customTheme, setCustomToken, resetCustomToken, setCustomModeMap, resetCustomMode } =
    useTheme();

  // Default the editing palette to whatever mode is currently active
  const [editDark, setEditDark] = useState(effectiveDark);

  const modeMap = editDark ? customTheme.dark : customTheme.light;

  const handleSetToken = (cssVar: string, value: string) => {
    setCustomToken(editDark, cssVar, value);
  };

  const handleResetToken = (cssVar: string) => {
    resetCustomToken(editDark, cssVar);
  };

  const handlePreset = (presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setCustomModeMap(editDark, editDark ? preset.dark : preset.light);
  };

  const handleResetAll = () => {
    if (!window.confirm(s.resetAllConfirm)) return;
    resetCustomMode(editDark);
  };

  const hasAnyCustom = Object.keys(modeMap).some((k) => modeMap[k]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-bright">{s.appearanceSection}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.appearanceSubtitle}</p>
      </div>

      {/* Color mode toggle */}
      <section className="mb-8 rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-bright">{s.themeLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Light, dark, or follow the system setting.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Live preview */}
      <div className="mb-8">
        <PreviewCard />
      </div>

      {/* Palette editor */}
      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        {/* Editor mode selector + presets row */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-bright">{s.editingModeLabel}</span>
            <div
              className="flex items-center rounded-lg border border-default bg-brand-700/55 dark:bg-brand-700/35 p-0.5 gap-0.5"
              role="group"
              aria-label="Select mode to edit"
            >
              {[
                { value: false, label: s.editingModeLight },
                { value: true, label: s.editingModeDark },
              ].map(({ value, label }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setEditDark(value)}
                  aria-pressed={editDark === value}
                  className={`press rounded-md px-3 py-1 text-xs transition-all ${
                    editDark === value
                      ? 'bg-brand-700 text-bright shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Presets */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{s.presetsLabel}:</span>
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePreset(preset.id)}
                  className="rounded-lg border border-default px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[var(--accent)] hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Reset all */}
            {hasAnyCustom && (
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-[var(--app-bg-muted)] hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                {s.resetAllLabel}
              </button>
            )}
          </div>
        </div>

        {/* Token groups */}
        <div className="space-y-5">
          {TOKEN_GROUPS.map((group) => {
            const tokens = THEME_TOKENS.filter((t) => t.group === group);
            return (
              <div key={group}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                <div className="divide-y divide-[var(--app-border-muted)]">
                  {tokens.map((token) => (
                    <TokenRow
                      key={token.id}
                      token={token}
                      editDark={editDark}
                      overrideValue={modeMap[token.cssVar]}
                      onSet={handleSetToken}
                      onReset={handleResetToken}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-[11px] text-muted-foreground">
          Changes apply instantly and are saved to this browser. Resetting removes custom overrides and restores defaults.
        </p>
      </section>

      {/* Radius / density / animations */}
      <div className="mt-8">
        <h2 className="mb-5 text-base font-semibold text-bright">Shape &amp; motion</h2>
        <UiPrefsSection />
      </div>
    </div>
  );
}
