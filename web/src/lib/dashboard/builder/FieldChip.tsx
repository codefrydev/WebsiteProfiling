
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
  const cls = `flex items-center gap-1.5 w-full text-left px-2.5 py-1 rounded-full border text-xs transition-colors ${
    isMeasure
      ? 'border-md-sys-success/30 bg-md-sys-success-container/10 hover:border-md-sys-success/60'
      : 'border-md-sys-primary/30 bg-md-sys-primary-container/10 hover:border-md-sys-primary/60'
  } ${draggable.isDragging ? 'opacity-40' : ''} ${overlay ? 'shadow-lg cursor-grabbing' : 'cursor-grab'}`;

  if (overlay) {
    return (
      <div className={cls}>
        <GripVertical className="h-3 w-3 shrink-0 text-md-sys-on-surface-variant" />
        <span className="truncate text-md-sys-on-surface">{field.label}</span>
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
      <GripVertical className="h-3 w-3 shrink-0 text-md-sys-on-surface-variant" />
      <span className="truncate text-md-sys-on-surface">{field.label}</span>
      <span className={`ml-auto text-[9px] uppercase tracking-wide font-bold ${isMeasure ? 'text-md-sys-success' : 'text-md-sys-primary'}`}>
        {isMeasure ? '#' : 'Aa'}
      </span>
    </button>
  );
}
