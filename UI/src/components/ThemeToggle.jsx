import { Monitor, Moon, Sun } from 'lucide-react';
import { strings } from '../lib/strings';
import { useTheme } from '../context/useTheme.js';

const MODES = [
  { id: 'light', icon: Sun, label: () => strings.app.themeLight },
  { id: 'dark', icon: Moon, label: () => strings.app.themeDark },
  { id: 'system', icon: Monitor, label: () => strings.app.themeSystem },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="flex items-center rounded-lg border border-default bg-brand-700/35 p-0.5 gap-0.5"
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
            className={`p-2 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              active
                ? 'bg-brand-700 text-bright shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
