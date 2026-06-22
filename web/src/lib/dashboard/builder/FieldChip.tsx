'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { FieldDef } from '@/lib/dashboard/engine/types';

interface FieldChipProps {
  field: FieldDef;
  onQuickAdd?: (field: FieldDef) => void;
  overlay?: boolean;
}

export function FieldChip({ field, onQuickAdd, overlay }: FieldChipProps) {
  const draggable = useDraggable({ id: `field:${field.key}`, data: { field }, disabled: overlay });
  const isMeasure = field.role === 'measure';
  const cls = `flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-md border text-xs transition-colors ${
    isMeasure
      ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60'
      : 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60'
  } ${draggable.isDragging ? 'opacity-40' : ''} ${overlay ? 'shadow-lg cursor-grabbing' : 'cursor-grab'}`;

  if (overlay) {
    return (
      <div className={cls}>
        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-bright">{field.label}</span>
      </div>
    );
  }

  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      onClick={() => onQuickAdd?.(field)}
      className={cls}
      title={`${field.key} — drag to a shelf, or click to add`}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-bright">{field.label}</span>
      <span className={`ml-auto text-[9px] uppercase tracking-wide ${isMeasure ? 'text-emerald-400' : 'text-blue-400'}`}>
        {isMeasure ? '#' : 'Aa'}
      </span>
    </button>
  );
}
