
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
      <div className="flex items-center gap-1.5 bg-brand-900 border border-default rounded-lg px-2.5 py-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-48 sm:w-56"
        />
      </div>
      <button
        type="button"
        onClick={onExport}
        className="ml-auto px-3 py-1.5 text-xs bg-brand-900 border border-default rounded-lg text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <Download className="w-3.5 h-3.5" />
        {exportLabel}
      </button>
    </div>
  );
}
