
import { Search, X } from 'lucide-react';
import { strings, format } from '../../lib/strings';
import { SOURCE_CONFIG } from './keywordTableUtils';

export interface KeywordFiltersBarProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  intentFilter: string;
  onIntentChange: (v: string) => void;
  brandedFilter: string;
  onBrandedChange: (v: string) => void;
  sourceFilter: string;
  onSourceChange: (v: string) => void;
  resultCount: number;
  showBrandScope?: boolean;
  brandScoped?: boolean;
  onBrandScopedChange?: (v: boolean) => void;
}

export default function KeywordFiltersBar({
  searchQuery,
  onSearchChange,
  intentFilter,
  onIntentChange,
  brandedFilter,
  onBrandedChange,
  sourceFilter,
  onSourceChange,
  resultCount,
  showBrandScope,
  brandScoped,
  onBrandScopedChange,
}: KeywordFiltersBarProps) {
  const f = strings.views.keywordsExplorer.filters;
  const hasActive = !!(searchQuery || intentFilter || brandedFilter || sourceFilter);

  return (
    <div className="px-4 py-3 border-b border-md-sys-outline-variant/40 bg-md-sys-surface-container/40 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {showBrandScope && onBrandScopedChange != null && (
          <label className="flex items-center gap-2 text-xs text-md-sys-on-surface-variant cursor-pointer select-none px-2 py-1.5 rounded-lg border border-accent/25 bg-accent/5">
            <input
              type="checkbox"
              checked={brandScoped}
              onChange={(e) => onBrandScopedChange(e.target.checked)}
              className="rounded border-md-sys-outline-variant/40"
            />
            {strings.views.keywordsExplorer.brandScopeToggle}
          </label>
        )}
        <div className="flex items-center gap-1.5 bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 rounded-lg px-2.5 py-1.5 flex-1 min-w-[12rem] max-w-md">
          <Search className="w-3.5 h-3.5 text-md-sys-on-surface-variant shrink-0" aria-hidden />
          <input
            type="search"
            placeholder={f.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={f.searchPlaceholder}
            className="bg-transparent text-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 focus:outline-none w-full min-w-0"
          />
        </div>
        <select
          value={intentFilter}
          onChange={(e) => onIntentChange(e.target.value)}
          className="bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 rounded-lg px-2.5 py-1.5 text-sm text-md-sys-on-surface focus:outline-none cursor-pointer"
          aria-label={f.allIntents}
        >
          <option value="">{f.allIntents}</option>
          <option value="informational">{f.intentInformational}</option>
          <option value="commercial">{f.intentCommercial}</option>
          <option value="transactional">{f.intentTransactional}</option>
          <option value="navigational">{f.intentNavigational}</option>
        </select>
        <select
          value={brandedFilter}
          onChange={(e) => onBrandedChange(e.target.value)}
          className="bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 rounded-lg px-2.5 py-1.5 text-sm text-md-sys-on-surface focus:outline-none cursor-pointer"
          aria-label={f.allBranded}
        >
          <option value="">{f.allBranded}</option>
          <option value="branded">{f.brandedOnly}</option>
          <option value="nonbranded">{f.nonBranded}</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => onSourceChange(e.target.value)}
          className="bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 rounded-lg px-2.5 py-1.5 text-sm text-md-sys-on-surface focus:outline-none cursor-pointer max-w-[11rem]"
          aria-label={f.allSources}
        >
          <option value="">{f.allSources}</option>
          {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {hasActive && (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              onIntentChange('');
              onBrandedChange('');
              onSourceChange('');
            }}
            className="inline-flex items-center gap-1 text-xs text-md-sys-on-surface-variant hover:text-md-sys-on-surface px-2 py-1.5 rounded-lg hover:bg-md-sys-surface-container-low"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            {f.clear}
          </button>
        )}
        <span className="ml-auto text-xs font-medium text-md-sys-on-surface-variant tabular-nums shrink-0">
          {format(strings.views.keywordsExplorer.filters.count, { count: resultCount })}
        </span>
      </div>
    </div>
  );
}
