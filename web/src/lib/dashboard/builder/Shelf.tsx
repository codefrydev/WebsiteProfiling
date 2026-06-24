
import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { FieldRole } from '@/lib/dashboard/engine/types';

interface ShelfProps {
  id: 'category' | 'values' | 'legend' | 'filters';
  label: string;
  accepts: FieldRole[];
  empty: string;
  children?: ReactNode;
  hasItems: boolean;
}

export function Shelf({ id, label, accepts, empty, children, hasItems }: ShelfProps) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `shelf:${id}`, data: { accepts } });
  const activeRole = (active?.data.current as { field?: { role?: FieldRole } } | undefined)?.field?.role;
  const compatible = !activeRole || accepts.includes(activeRole);
  const highlight = isOver && compatible;
  const dim = active && !compatible;

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div
        ref={setNodeRef}
        className={`min-h-[34px] rounded-lg border p-1.5 flex flex-wrap gap-1.5 transition-colors ${
          highlight ? 'border-blue-400 bg-blue-500/10' : 'border-dashed border-default'
        } ${dim ? 'opacity-40' : ''}`}
      >
        {hasItems ? children : <span className="text-[11px] text-muted-foreground px-1 py-0.5">{empty}</span>}
      </div>
    </div>
  );
}
