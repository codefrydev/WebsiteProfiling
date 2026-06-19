'use client';

import { X, LayoutTemplate } from 'lucide-react';
import { DASHBOARD_PRESETS } from '@/lib/dashboard/presets/presets';

interface PresetPickerProps {
  onSelect: (presetId: string) => void;
  onClose: () => void;
}

export default function PresetPicker({ onSelect, onClose }: PresetPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-900 border border-default rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-blue-400" />
            <h2 className="font-bold text-bright">Dashboard templates</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 py-2 text-xs text-muted-foreground border-b border-default shrink-0">
          Start from a pre-built layout. You can customize widgets after creating.
        </p>

        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {DASHBOARD_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                onClick={() => onSelect(preset.id)}
                className="w-full text-left px-4 py-3 rounded-lg border border-default hover:border-blue-500/50 hover:bg-brand-800/60 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bright group-hover:text-blue-300 transition-colors">
                      {preset.name}
                    </p>
                    <p className="text-xs text-blue-400/80 mt-0.5">{preset.tagline}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">{preset.description}</p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-brand-800 px-2 py-1 rounded">
                    Use template
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
