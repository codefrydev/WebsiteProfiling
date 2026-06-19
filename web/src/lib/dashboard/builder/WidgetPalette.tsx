'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { catalogBySection, catalogBySectionSections, type CatalogEntry } from '@/lib/dashboard/catalog/catalog';
import type { VizType, Widget, WidgetBinding } from '@/lib/dashboard/types';
import { defaultWidgetLayout, newWidgetId } from '@/lib/dashboard/types';
import { VIZ_LABELS } from '@/lib/dashboard/viz/labels';

interface WidgetPaletteProps {
  onAdd: (widget: Widget) => void;
  onClose: () => void;
}

export default function WidgetPalette({ onAdd, onClose }: WidgetPaletteProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [viz, setViz] = useState<VizType>('kpi');

  const sections = catalogBySectionSections();
  const bySection = catalogBySection();

  const filteredSections = sections.map((s) => ({
    section: s,
    entries: bySection[s].filter(
      (e) =>
        !search ||
        e.label.toLowerCase().includes(search.toLowerCase()) ||
        e.description.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((s) => s.entries.length > 0);

  const handleSelectEntry = (entry: CatalogEntry) => {
    setSelected(entry);
    setViz(entry.compatibleViz[0] ?? 'kpi');
  };

  const handleAdd = () => {
    if (!selected) return;

    const binding: WidgetBinding = {
      source: 'audit-tool',
      toolName: selected.toolName,
      args: selected.defaultArgs,
      valueField: selected.defaultValueField,
      xField: selected.defaultXField,
      yField: selected.defaultYField,
      select: selected.rowsPath,
    };

    onAdd({
      id: newWidgetId(),
      title: selected.label,
      viz,
      binding,
      layout: defaultWidgetLayout(viz),
    });
    onClose();
  };

  const handleAddMarkdown = () => {
    onAdd({
      id: newWidgetId(),
      title: 'Note',
      viz: 'markdown',
      binding: { source: 'audit-tool', toolName: '' },
      layout: defaultWidgetLayout('markdown'),
      options: { markdownContent: '## Heading\n\nAdd your notes here…' },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-900 border border-default rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <h2 className="font-bold text-bright">Add widget</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-default shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search data sources…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {(!search || 'text note markdown'.includes(search.toLowerCase())) && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Content</p>
                <button
                  onClick={handleAddMarkdown}
                  className="w-full text-left px-3 py-2 rounded-lg border border-default hover:border-blue-500/50 hover:bg-brand-800/60 transition-colors"
                >
                  <p className="text-sm font-medium text-bright">Text / Markdown</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add free-text notes or headings.</p>
                </button>
              </div>
            )}

            {filteredSections.map(({ section, entries }) => (
              <div key={section}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{section}</p>
                <div className="space-y-1">
                  {entries.map((entry) => (
                    <button
                      key={entry.toolName}
                      onClick={() => handleSelectEntry(entry)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        selected?.toolName === entry.toolName
                          ? 'border-blue-500 bg-blue-500/10 text-bright'
                          : 'border-default hover:border-blue-500/40 hover:bg-brand-800/60'
                      }`}
                    >
                      <p className="text-sm font-medium text-bright">{entry.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="w-60 shrink-0 border-l border-default p-3 flex flex-col gap-2 overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Visualization</p>
              <div className="space-y-1">
                {selected.compatibleViz.map((v) => (
                  <button
                    key={v}
                    onClick={() => setViz(v)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      viz === v ? 'bg-blue-600 text-white font-medium' : 'text-foreground hover:bg-white/5'
                    }`}
                  >
                    {VIZ_LABELS[v]}
                  </button>
                ))}
              </div>
              <div className="mt-auto pt-2">
                <button
                  onClick={handleAdd}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  Add to dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
