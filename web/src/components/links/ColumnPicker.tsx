'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import Button from '@/components/Button';
import { LINK_TABLE_COLUMNS, DEFAULT_COLUMN_KEYS, toggleColumn } from '@/lib/columnConfig';

interface ColumnPickerProps {
  columns?: string[];
  onChange: (cols: string[] | undefined) => void;
}

const TOGGLEABLE = LINK_TABLE_COLUMNS.filter((c) => !c.alwaysVisible);

export default function ColumnPicker({ columns, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = new Set(columns ?? DEFAULT_COLUMN_KEYS);
  const hiddenCount = TOGGLEABLE.filter((c) => !visible.has(c.key)).length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="secondary"
        className="!py-1 !px-2 !text-xs inline-flex items-center gap-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Columns3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Columns
        {hiddenCount > 0 ? (
          <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white">
            {hiddenCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-default bg-brand-900 shadow-xl py-1">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
            Toggle columns
          </p>
          {TOGGLEABLE.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-brand-800 select-none"
            >
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onChange(toggleColumn(columns, col.key))}
                className="accent-blue-500"
              />
              <span className="text-foreground">{col.label}</span>
            </label>
          ))}
          {columns != null ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="w-full text-left px-3 py-1.5 text-xs text-link hover:underline border-t border-default mt-1 pt-2"
            >
              Reset to defaults
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
