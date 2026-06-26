
import { useEffect, useState } from 'react';
import { strings } from '@/lib/strings';
import { getCachedClientPreferences, initClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

const s = strings.settings;

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

export default function LayoutPanel() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getCachedClientPreferences().sidebarCollapsed,
  );

  useEffect(() => {
    void initClientPreferences().then((prefs) => {
      setSidebarCollapsed(prefs.sidebarCollapsed);
    });
  }, []);

  const handleSidebarCollapsed = (value: boolean) => {
    setSidebarCollapsed(value);
    try {
      localStorage.setItem('app-sidebar-collapsed', value ? '1' : '0');
    } catch {
      /* ignore */
    }
    patchClientPreferences({ sidebarCollapsed: value });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-bright">{s.layoutSection}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.layoutSubtitle}</p>
      </div>

      <section className="rounded-2xl border border-default bg-[var(--app-bg-elevated)] divide-y divide-[var(--app-border-muted)]">
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="min-w-0">
            <label
              htmlFor="sidebar-collapsed-toggle"
              className="block text-sm font-medium text-bright cursor-pointer"
            >
              {s.sidebarCollapseLabel}
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.sidebarCollapseHelp}</p>
          </div>
          <div className="flex-shrink-0 pt-0.5">
            <Toggle
              id="sidebar-collapsed-toggle"
              checked={sidebarCollapsed}
              onChange={handleSidebarCollapsed}
            />
          </div>
        </div>
      </section>

      <p className="mt-4 text-[11px] text-muted-foreground">
        These preferences sync across browsers and take effect on the next page load.
      </p>
    </div>
  );
}
