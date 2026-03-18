import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';

export default function SortTh({ label, field, sortBy, sortDesc, onSort, className = '' }) {
  const active = sortBy === field;
  return (
    <th
      className={`px-4 py-4 cursor-pointer select-none hover:text-bright transition-colors ${active ? 'text-bright' : 'text-slate-400'} ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? (sortDesc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </th>
  );
}
