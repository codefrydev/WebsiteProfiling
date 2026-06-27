
import { useEffect, useState } from 'react';
import {
  DEFAULT_LANDING_VIEW,
  LANDING_VIEW_OPTIONS,
  getDefaultLandingView,
  setDefaultLandingView,
} from '@/lib/defaultViewPref';
import { initClientPreferences } from '@/lib/clientPreferences';
import type { ViewId } from '@/routes';

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { id: string; label: string; description: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="py-4">
      <p className="mb-0.5 text-sm font-medium text-bright">{label}</p>
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex flex-col items-start rounded-xl border px-3.5 py-3 text-left transition-all ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                  : 'border-default hover:border-[var(--accent)] hover:bg-[var(--app-bg-muted)]'
              }`}
            >
              <span className={`text-xs font-medium ${active ? 'text-[var(--accent)]' : 'text-bright'}`}>
                {opt.label}
              </span>
              <span className="mt-0.5 text-[11px] text-muted-foreground">{opt.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DefaultsPanel() {
  const [defaultView, setDefaultView] = useState<ViewId>(DEFAULT_LANDING_VIEW);

  useEffect(() => {
    void initClientPreferences().then(() => {
      setDefaultView(getDefaultLandingView());
    });
  }, []);

  const handleDefaultViewChange = (id: string) => {
    const view = id as ViewId;
    setDefaultView(view);
    setDefaultLandingView(view);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-bright">Defaults</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which view opens when you select a site from the home page. Syncs across browsers.
        </p>
      </div>

      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] p-5">
        <SelectRow
          label="Default report view"
          description="The view that opens automatically when you click a site in your portfolio."
          value={defaultView}
          options={LANDING_VIEW_OPTIONS}
          onChange={handleDefaultViewChange}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Saved to this browser only. Crawl-only previews always open the Links view.
        </p>
      </section>
    </div>
  );
}
