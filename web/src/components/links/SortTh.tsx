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
  return (
    <th
      className={`px-4 py-4 cursor-pointer select-none hover:text-bright transition-colors ${active ? 'text-bright' : 'text-muted-foreground'} ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
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
