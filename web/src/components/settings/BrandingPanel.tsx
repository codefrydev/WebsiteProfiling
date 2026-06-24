
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Upload, X, ImageIcon } from 'lucide-react';
import { useBranding } from '@/context/useBranding';
import { DEFAULT_BRANDING } from '@/context/BrandingContext';

// ─── Text setting row ─────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  value,
  placeholder,
  defaultValue,
  onSave,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  defaultValue: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCustom = value !== defaultValue && value !== '';

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(next), 600);
  };

  const handleReset = () => {
    setDraft(defaultValue);
    onSave('');
  };

  return (
    <div className="flex items-start gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <label className="text-sm font-medium text-bright">{label}</label>
          {isCustom && (
            <span className="rounded-full bg-[var(--accent-bg)] px-1.5 py-px text-[10px] font-medium text-[var(--accent)]">
              Custom
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => handleChange(e.target.value)}
            className="flex-1 rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-1.5 text-sm text-foreground transition-colors focus:border-[var(--accent)] focus:outline-none"
          />
          {isCustom && (
            <button
              type="button"
              title="Reset to default"
              onClick={handleReset}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[var(--app-bg-muted)] hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Logo upload section ──────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 500 * 1024; // 500 KB

function LogoUploadSection() {
  const { logoUrl, setLogoUrl } = useBranding();
  const [urlDraft, setUrlDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasCustomLogo = Boolean(logoUrl);

  const processFile = useCallback(
    (file: File): void => {
      setError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Unsupported file type. Use PNG, JPG, SVG, WebP, or GIF.');
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`File is too large (${Math.round(file.size / 1024)} KB). Maximum is 500 KB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setSaving(true);
        setLogoUrl(dataUrl);
        setSaving(false);
      };
      reader.readAsDataURL(file);
    },
    [setLogoUrl],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleUrlSave = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    setLogoUrl(trimmed);
    setUrlDraft('');
  };

  const handleReset = () => {
    setLogoUrl('');
    setError(null);
  };

  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-0.5">
        <p className="text-sm font-medium text-bright">Logo</p>
        {hasCustomLogo && (
          <span className="rounded-full bg-[var(--accent-bg)] px-1.5 py-px text-[10px] font-medium text-[var(--accent)]">
            Custom
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Shown in the sidebar and as the chat assistant avatar. PNG, SVG, JPG or WebP · max 500 KB.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Drop zone */}
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative flex min-h-[100px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all sm:w-48 ${
            dragOver
              ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
              : 'border-default hover:border-[var(--accent)] hover:bg-[var(--app-bg-muted)]'
          }`}
        >
          {hasCustomLogo ? (
            <>
              <img
                src={logoUrl}
                alt="Custom logo"
                className="h-10 w-10 object-contain"
              />
              <span className="text-[11px] text-muted-foreground">Click to replace</span>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-bg-muted)]">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {dragOver ? 'Drop to upload' : 'Click or drag & drop'}
              </span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            onChange={handleFileInput}
          />
        </button>

        {/* Right side — URL + actions */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Or paste an image URL</p>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                placeholder="https://example.com/logo.png"
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSave(); }}
                className="flex-1 rounded-lg border border-default bg-[var(--app-bg-muted)] px-3 py-1.5 text-sm text-foreground transition-colors focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="button"
                disabled={!urlDraft.trim()}
                onClick={handleUrlSave}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                Use URL
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
              <X className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {saving && (
            <p className="text-xs text-muted-foreground">Saving…</p>
          )}

          {hasCustomLogo && (
            <button
              type="button"
              onClick={handleReset}
              className="flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[var(--app-bg-muted)] hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default logo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function BrandingPanel() {
  const { productName, productSubtitle, logoUrl, setBrandName, setBrandSubtitle } = useBranding();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-bright">Branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customise the logo, product name and subtitle shown in the sidebar. Changes are saved to the database and
          apply for all users on this instance.
        </p>
      </div>

      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <div className="divide-y divide-[var(--app-border-muted)]">
          <LogoUploadSection />
          <SettingRow
            label="Product name"
            description="Shown in the sidebar header. Defaults to 'Site Audit'."
            value={productName}
            placeholder={DEFAULT_BRANDING.productName}
            defaultValue={DEFAULT_BRANDING.productName}
            onSave={setBrandName}
          />
          <SettingRow
            label="Product subtitle"
            description="One-line tagline below the product name in the sidebar."
            value={productSubtitle}
            placeholder={DEFAULT_BRANDING.productSubtitle}
            defaultValue={DEFAULT_BRANDING.productSubtitle}
            onSave={setBrandSubtitle}
          />
        </div>

        {/* Live preview */}
        <div className="mt-4 rounded-xl border border-default bg-[var(--app-bg-muted)] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sidebar preview
          </p>
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-7 w-7 shrink-0 object-contain"
                aria-hidden
              />
            ) : (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-[var(--accent)] opacity-80" />
            )}
            <div>
              <div className="text-sm font-bold text-bright leading-tight">{productName}</div>
              <div className="text-[11px] text-muted-foreground">{productSubtitle}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
