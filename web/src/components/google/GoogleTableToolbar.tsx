
import { Search, Download } from 'lucide-react';

interface GoogleTableToolbarProps {
  searchPlaceholder: string;
  search: string;
  onSearch: (value: string) => void;
  onExport: () => void;
  exportLabel: string;
}

export default function GoogleTableToolbar({
  searchPlaceholder,
  search,
  onSearch,
  onExport,
  exportLabel,
}: GoogleTableToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center p-4 pb-0">
      <div className="flex items-center gap-2 bg-md-sys-surface-container-high border border-md-sys-outline-variant/40 rounded-full px-3.5 py-1.5 focus-within:border-md-sys-primary focus-within:ring-2 focus-within:ring-md-sys-primary/20 transition-all">
        <Search className="w-3.5 h-3.5 text-md-sys-on-surface-variant" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="bg-transparent text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 focus:outline-none w-48 sm:w-56"
        />
      </div>
      <button
        type="button"
        onClick={onExport}
        className="ml-auto px-4 py-1.5 text-xs bg-md-sys-surface-container-high border border-md-sys-outline-variant/50 rounded-full text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-highest active:scale-[0.98] transition-all flex items-center gap-1.5"
      >
        <Download className="w-3.5 h-3.5" />
        {exportLabel}
      </button>
    </div>
  );
}
