'use client';

import { useEffect, useState } from 'react';
import { Plus, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import Select, { SELECT_CLASS } from '@/components/Select';
import Button from '@/components/Button';
import {
  FILTER_FIELDS,
  FILTER_FIELDS_BY_KEY,
  operatorsForKind,
  countActiveConditions,
  type AdvancedCondition,
} from '@/lib/advancedLinkFilter';

export interface AdvancedLinkFiltersProps {
  conditions: AdvancedCondition[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Pick<AdvancedCondition, 'field' | 'op' | 'value'>>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function valueInputType(kind: string): string {
  return kind === 'number' ? 'number' : 'text';
}

function valuePlaceholder(kind: string): string {
  if (kind === 'status') return 'e.g. 404 or 4xx';
  if (kind === 'number') return '0';
  return 'text…';
}

export default function AdvancedLinkFilters({
  conditions,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
}: AdvancedLinkFiltersProps) {
  const activeCount = countActiveConditions(conditions);
  const [open, setOpen] = useState(false);

  // Reveal the panel whenever conditions become active (e.g. loading a saved view).
  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  const handleFieldChange = (id: string, field: string) => {
    const def = FILTER_FIELDS_BY_KEY[field];
    const op = def ? operatorsForKind(def.kind)[0].op : 'eq';
    onUpdate(id, { field, op });
  };

  return (
    <div className="rounded-lg border border-default bg-brand-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Advanced filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        ) : null}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-default px-3 py-3">
          {conditions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add conditions to narrow the table. All conditions are combined with AND.
            </p>
          ) : null}

          {conditions.map((c) => {
            const def = FILTER_FIELDS_BY_KEY[c.field];
            const ops = def ? operatorsForKind(def.kind) : [];
            const kind = def?.kind ?? 'string';
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <Select
                  value={c.field}
                  onChange={(e) => handleFieldChange(c.id, e.target.value)}
                  aria-label="Filter field"
                  className="!py-1 text-xs"
                >
                  {FILTER_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={c.op}
                  onChange={(e) => onUpdate(c.id, { op: e.target.value })}
                  aria-label="Operator"
                  className="!py-1 text-xs"
                >
                  {ops.map((o) => (
                    <option key={o.op} value={o.op}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <input
                  type={valueInputType(kind)}
                  value={c.value}
                  onChange={(e) => onUpdate(c.id, { value: e.target.value })}
                  placeholder={valuePlaceholder(kind)}
                  aria-label="Filter value"
                  className={`${SELECT_CLASS} !py-1 w-32 text-xs`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  aria-label="Remove condition"
                  className="rounded p-1 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="!py-1 !px-2 !text-xs"
              onClick={onAdd}
            >
              <Plus className="h-3.5 w-3.5" />
              Add condition
            </Button>
            {conditions.length > 0 ? (
              <button type="button" onClick={onClear} className="text-xs text-link hover:underline">
                Clear conditions
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
