
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
      className={`press relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${
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
        <h1 className="text-xl font-semibold text-md-sys-on-surface">{s.layoutSection}</h1>
        <p className="mt-1 text-sm text-md-sys-on-surface-variant">{s.layoutSubtitle}</p>
      </div>

      <section className="rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container divide-y divide-md-sys-outline-variant/40">
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="min-w-0">
            <label
              htmlFor="sidebar-collapsed-toggle"
              className="block text-sm font-medium text-md-sys-on-surface cursor-pointer"
            >
              {s.sidebarCollapseLabel}
            </label>
            <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{s.sidebarCollapseHelp}</p>
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

      <p className="mt-4 text-[11px] text-md-sys-on-surface-variant">
        These preferences sync across browsers and take effect on the next page load.
      </p>
    </div>
  );
}
