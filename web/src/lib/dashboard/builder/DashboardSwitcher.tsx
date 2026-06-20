'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Check, Trash2, Star, ChevronDown, LayoutTemplate } from 'lucide-react';
import type { DashboardRow } from '@/server/dashboardsDb';
import { DASHBOARD_PRESETS } from '@/lib/dashboard/presets/presets';

interface DashboardSwitcherProps {
  dashboards: DashboardRow[];
  activeDashboardId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onCreateFromPreset: (presetId: string) => void;
  onBrowsePresets: () => void;
  onDelete: (id: number) => void;
  onSetDefault: (id: number) => void;
}

export default function DashboardSwitcher({
  dashboards,
  activeDashboardId,
  onSelect,
  onCreate,
  onCreateFromPreset,
  onBrowsePresets,
  onDelete,
  onSetDefault,
}: DashboardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = dashboards.find((d) => d.id === activeDashboardId);

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled dashboard';
    onCreate(name);
    setNewName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-default hover:bg-white/5 text-sm text-bright transition-colors min-w-[180px] max-w-xs"
      >
        <span className="truncate flex-1 text-left">
          {active ? active.name : 'Select dashboard'}
        </span>
        {active?.isDefault && <Star className="h-3 w-3 shrink-0 text-yellow-400 fill-yellow-400" />}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-brand-900 border border-default rounded-xl shadow-2xl z-40 overflow-hidden">
          {dashboards.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">No dashboards yet.</p>
          ) : (
            <ul className="py-1 max-h-56 overflow-y-auto">
              {dashboards.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors group ${
                    d.id === activeDashboardId ? 'bg-blue-500/10' : ''
                  }`}
                >
                  <button
                    className="flex-1 text-left text-sm text-bright truncate"
                    onClick={() => { onSelect(d.id); setOpen(false); }}
                  >
                    {d.name}
                  </button>
                  {d.id === activeDashboardId && (
                    <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  )}
                  {d.isDefault && (
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 shrink-0" />
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    {!d.isDefault && (
                      <button
                        title="Set as default"
                        onClick={(e) => { e.stopPropagation(); onSetDefault(d.id); }}
                        className="p-0.5 rounded hover:bg-yellow-400/20 text-muted-foreground hover:text-yellow-400 transition-colors"
                      >
                        <Star className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      title="Delete dashboard"
                      onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
                      className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-default p-2 space-y-1">
            <button
              onClick={() => { onBrowsePresets(); setOpen(false); }}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-white/5 text-sm text-muted-foreground hover:text-bright transition-colors"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Browse templates…
            </button>

            {dashboards.length === 0 && (
              <div className="pt-1 space-y-1">
                <p className="px-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Quick start
                </p>
                {DASHBOARD_PRESETS.slice(0, 3).map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => { onCreateFromPreset(preset.id); setOpen(false); }}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors"
                  >
                    <p className="text-sm text-bright truncate">{preset.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{preset.tagline}</p>
                  </button>
                ))}
              </div>
            )}

            {creating ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  placeholder="Dashboard name…"
                  className="flex-1 px-2 py-1 text-sm bg-brand-800 border border-default rounded-md text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleCreate}
                  className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-white/5 text-sm text-muted-foreground hover:text-bright transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New dashboard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
