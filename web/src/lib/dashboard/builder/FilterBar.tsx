'use client';

import { useState, useCallback } from 'react';
import { X, Filter, Plus, ChevronDown } from 'lucide-react';
import type { DashboardFilter, CrossFilter } from '@/lib/dashboard/types';
import { catalogEntry, dimensions } from '@/lib/dashboard/catalog/catalog';
import type { Widget } from '@/lib/dashboard/types';

interface FilterBarProps {
  filters: DashboardFilter[];
  crossFilters: CrossFilter[];
  widgets: Widget[];
  isEditing: boolean;
  /** Available distinct values per dimension key (collected from fetched data). */
  dimensionValues: Record<string, string[]>;
  onFiltersChange: (filters: DashboardFilter[]) => void;
  onCrossFilterRemove: (id: string) => void;
  onCrossFilterClearAll: () => void;
}

export function FilterBar({
  filters,
  crossFilters,
  widgets,
  isEditing,
  dimensionValues,
  onFiltersChange,
  onCrossFilterRemove,
  onCrossFilterClearAll,
}: FilterBarProps) {
  const [showAddFilter, setShowAddFilter] = useState(false);

  const hasAny = filters.length > 0 || crossFilters.length > 0;
  if (!hasAny && !isEditing) return null;

  const handleFilterValueChange = (filterId: string, value: string | string[]) => {
    onFiltersChange(
      filters.map((f) => f.id === filterId ? { ...f, value } : f),
    );
  };

  const handleRemoveFilter = (filterId: string) => {
    onFiltersChange(filters.filter((f) => f.id !== filterId));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-default bg-brand-950/60 min-h-[48px]">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground shrink-0">
        <Filter className="h-3.5 w-3.5" />
        Filters
      </span>

      {/* Board-level filters */}
      {filters.map((f) => (
        <FilterChip
          key={f.id}
          filter={f}
          options={dimensionValues[f.field] ?? []}
          onValueChange={(v) => handleFilterValueChange(f.id, v)}
          onRemove={isEditing ? () => handleRemoveFilter(f.id) : undefined}
        />
      ))}

      {/* Cross-filters from chart clicks */}
      {crossFilters.map((cf) => (
        <span
          key={cf.id}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30"
        >
          <span className="font-mono opacity-70">{cf.field.split('.').pop()}:</span>
          <span className="font-medium">{cf.value}</span>
          <button
            onClick={() => onCrossFilterRemove(cf.id)}
            className="ml-0.5 hover:text-amber-200 transition-colors"
            aria-label="Remove cross-filter"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {crossFilters.length > 1 && (
        <button
          onClick={onCrossFilterClearAll}
          className="text-xs text-muted-foreground hover:text-bright transition-colors"
        >
          Clear all
        </button>
      )}

      {isEditing && (
        <div className="relative">
          <button
            onClick={() => setShowAddFilter((v) => !v)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-default hover:border-blue-500/50 text-muted-foreground hover:text-bright transition-colors"
          >
            <Plus className="h-3 w-3" /> Add filter
          </button>
          {showAddFilter && (
            <AddFilterPanel
              widgets={widgets}
              dimensionValues={dimensionValues}
              onAdd={(f) => {
                onFiltersChange([...filters, f]);
                setShowAddFilter(false);
              }}
              onClose={() => setShowAddFilter(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── FilterChip ─────────────────────────────────────────────────────────────

interface FilterChipProps {
  filter: DashboardFilter;
  options: string[];
  onValueChange: (v: string | string[]) => void;
  onRemove?: () => void;
}

function FilterChip({ filter, options, onValueChange, onRemove }: FilterChipProps) {
  const [open, setOpen] = useState(false);

  const displayValue =
    Array.isArray(filter.value)
      ? filter.value.length === 0 ? 'Any' : filter.value.join(', ')
      : filter.value || 'Any';

  return (
    <div className="relative flex items-center gap-0 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-l-full border border-default hover:border-blue-500/50 bg-brand-800 text-bright transition-colors"
      >
        <span className="text-muted-foreground font-normal">{filter.label}:</span>
        <span className="font-medium">{displayValue}</span>
        <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          className="px-1.5 py-0.5 rounded-r-full border border-l-0 border-default hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
          aria-label="Remove filter"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
      {open && (
        <FilterDropdown
          filter={filter}
          options={options}
          onValueChange={(v) => { onValueChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

interface FilterDropdownProps {
  filter: DashboardFilter;
  options: string[];
  onValueChange: (v: string | string[]) => void;
  onClose: () => void;
}

function FilterDropdown({ filter, options, onValueChange, onClose }: FilterDropdownProps) {
  const selected = Array.isArray(filter.value)
    ? filter.value
    : filter.value
    ? [filter.value]
    : [];

  if (filter.type === 'search') {
    return (
      <div className="absolute left-0 top-full mt-1 z-50 bg-brand-900 border border-default rounded-lg shadow-xl p-2 w-56">
        <input
          autoFocus
          type="text"
          placeholder="Search…"
          defaultValue={typeof filter.value === 'string' ? filter.value : ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onValueChange(e.currentTarget.value); }
            if (e.key === 'Escape') { onClose(); }
          }}
          className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-full mt-1 z-50 bg-brand-900 border border-default rounded-lg shadow-xl p-2 max-h-60 overflow-y-auto w-48">
      <button
        onClick={() => onValueChange(filter.type === 'multiselect' ? [] : '')}
        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground"
      >
        Any
      </button>
      {options.map((opt) => {
        const active =
          filter.type === 'multiselect' ? selected.includes(opt) : filter.value === opt;
        return (
          <button
            key={opt}
            onClick={() => {
              if (filter.type === 'multiselect') {
                const next = active
                  ? selected.filter((s) => s !== opt)
                  : [...selected, opt];
                onValueChange(next);
              } else {
                onValueChange(opt);
              }
            }}
            className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
              active ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-foreground'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── AddFilterPanel ──────────────────────────────────────────────────────────

interface AddFilterPanelProps {
  widgets: Widget[];
  dimensionValues: Record<string, string[]>;
  onAdd: (filter: DashboardFilter) => void;
  onClose: () => void;
}

function AddFilterPanel({ widgets, dimensionValues, onAdd, onClose }: AddFilterPanelProps) {
  const [selectedField, setSelectedField] = useState('');
  const [filterType, setFilterType] = useState<DashboardFilter['type']>('select');

  // Collect all dimension fields from widgets' catalog entries
  const dimensionFields: { key: string; label: string; toolName: string }[] = [];
  const seen = new Set<string>();
  for (const w of widgets) {
    const cat = catalogEntry(w.binding.toolName);
    if (!cat) continue;
    for (const f of dimensions(cat)) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        dimensionFields.push({ key: f.key, label: f.label, toolName: w.binding.toolName });
      }
    }
  }

  const handleAdd = useCallback(() => {
    if (!selectedField) return;
    const fieldDef = dimensionFields.find((f) => f.key === selectedField);
    const hasOptions = (dimensionValues[selectedField]?.length ?? 0) > 0;
    onAdd({
      id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: fieldDef?.label ?? selectedField.split('.').pop() ?? selectedField,
      field: selectedField,
      type: hasOptions ? filterType : 'search',
    });
  }, [selectedField, filterType, dimensionFields, dimensionValues, onAdd]);

  return (
    <div className="absolute left-0 top-full mt-1 z-50 bg-brand-900 border border-default rounded-lg shadow-xl p-3 w-64 space-y-2">
      <p className="text-xs font-bold text-bright">Add filter</p>
      <div>
        <label className="text-[10px] text-muted-foreground mb-0.5 block">Dimension field</label>
        <select
          value={selectedField}
          onChange={(e) => setSelectedField(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— select —</option>
          {dimensionFields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground mb-0.5 block">Filter type</label>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as DashboardFilter['type'])}
          className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="select">Single select</option>
          <option value="multiselect">Multi select</option>
          <option value="search">Text search</option>
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={!selectedField}
          className="flex-1 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded border border-default hover:bg-white/5 text-xs text-muted-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
