import { Monitor, Moon, Sun } from 'lucide-react';
import { strings } from '../lib/strings';
import { useTheme } from '../context/useTheme';
import type { ThemePreference } from '../context/themeContext';

const MODES: Array<{ id: ThemePreference; icon: typeof Sun; label: () => string }> = [
  { id: 'light', icon: Sun, label: () => strings.app.themeLight },
  { id: 'dark', icon: Moon, label: () => strings.app.themeDark },
  { id: 'system', icon: Monitor, label: () => strings.app.themeSystem },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="flex items-center rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-high p-1 gap-1"
      role="group"
      aria-label={strings.app.themeGroupLabel}
    >
      {MODES.map((mode) => {
        const { id, label } = mode;
        const Icon = mode.icon;
        const active = preference === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPreference(id)}
            title={label()}
            aria-label={label()}
            aria-pressed={active}
            className={`press p-1.5 rounded-full transition-all duration-200 ease-out active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-md-sys-primary ${
              active
                ? 'bg-md-sys-secondary-container text-md-sys-on-secondary-container shadow-xs font-semibold'
                : 'text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest/60'
            }`}
          >
            <Icon
              className={`h-4 w-4 transition-transform duration-200 ${active ? 'scale-110' : ''}`}
              strokeWidth={2}
            />
          </button>
        );
      })}
    </div>
  );
}
