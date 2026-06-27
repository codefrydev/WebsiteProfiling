import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from '../HelpHint';

export interface SortThProps {
  label: string;
  field: string;
  sortBy: string;
  sortDesc: boolean;
  onSort: (field: string) => void;
  className?: string;
  hint?: HelpHintContent;
}

export default function SortTh({ label, field, sortBy, sortDesc, onSort, className = '', hint }: SortThProps) {
  const active = sortBy === field;
  const hintContent = normalizeHintContent(hint);
  const alignEnd = className.includes('text-right');
  return (
    <th
      className={`px-3 sm:px-4 py-3.5 cursor-pointer select-none hover:text-bright transition-colors whitespace-nowrap ${active ? 'text-bright' : 'text-muted-foreground'} ${className}`}
      onClick={() => onSort(field)}
    >
      <div className={`inline-flex items-center gap-1 uppercase text-xs tracking-wide ${alignEnd ? 'justify-end w-full' : ''}`}>
        {label}
        {hintContent ? (
          <span
            className="inline-flex"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <HelpHint title={hintContent.title} ariaLabel={`About ${label}`}>
              {hintContent.body}
            </HelpHint>
          </span>
        ) : null}
        {active
          ? (sortDesc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </th>
  );
}
