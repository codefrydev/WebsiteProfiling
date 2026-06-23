
import { useState, useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import Select from '@/components/Select';
import Button from '@/components/Button';
import AlertBanner from '@/components/AlertBanner';
import { strings } from '@/lib/strings';

export interface LinksFilterValues {
  inlinksFilter: string;
  statusFilter: string;
  rtFilter: string;
  wcFilter: string;
  jsErrorFilter: string;
}

export interface LinksFilterBarProps {
  values: LinksFilterValues;
  onChange: (key: keyof LinksFilterValues, value: string) => void;
  onClearAll: () => void;
  searchQuery?: string;
  className?: string;
}

function FilterSelects({
  values,
  onChange,
  layout,
}: {
  values: LinksFilterValues;
  onChange: LinksFilterBarProps['onChange'];
  layout: 'row' | 'stack';
}) {
  const vl = strings.views.links;
  const sj = strings.common;
  const wrap = layout === 'stack' ? 'flex flex-col gap-3' : 'flex flex-wrap gap-2';

  return (
    <div className={wrap}>
      <Select value={values.inlinksFilter} onChange={(e) => onChange('inlinksFilter', e.target.value)} aria-label={vl.filterAllPages}>
        <option value={sj.all}>{vl.filterAllPages}</option>
        <option value="Orphans">{vl.filterOrphans}</option>
      </Select>
      <Select value={values.statusFilter} onChange={(e) => onChange('statusFilter', e.target.value)} aria-label={vl.filterAllStatus}>
        <option value={sj.all}>{vl.filterAllStatus}</option>
        <option value="200">{vl.status200}</option>
        <option value="404">{vl.status404}</option>
        <option value="301">{vl.status301}</option>
        <option value="302">{vl.status302}</option>
      </Select>
      <Select value={values.rtFilter} onChange={(e) => onChange('rtFilter', e.target.value)} aria-label={vl.filterAllRt}>
        <option value={sj.all}>{vl.filterAllRt}</option>
        <option value="Fast">{vl.filterFast}</option>
        <option value="Slow">{vl.filterSlow}</option>
      </Select>
      <Select value={values.wcFilter} onChange={(e) => onChange('wcFilter', e.target.value)} aria-label={vl.filterAllWc}>
        <option value={sj.all}>{vl.filterAllWc}</option>
        <option value="Thin">{vl.filterThin}</option>
        <option value="Medium">{vl.filterMedium}</option>
        <option value="Long">{vl.filterLong}</option>
      </Select>
      <Select value={values.jsErrorFilter} onChange={(e) => onChange('jsErrorFilter', e.target.value)} aria-label={vl.filterAllJs}>
        <option value={sj.all}>{vl.filterAllJs}</option>
        <option value="Has errors">{vl.filterJsErrors}</option>
        <option value="Clean">{vl.filterJsClean}</option>
      </Select>
    </div>
  );
}

export default function LinksFilterBar({
  values,
  onChange,
  onClearAll,
  searchQuery = '',
  className = '',
}: LinksFilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sj = strings.common;
  const vl = strings.views.links;

  const activeCount = useMemo(() => {
    let n = 0;
    if (values.inlinksFilter !== sj.all) n++;
    if (values.statusFilter !== sj.all) n++;
    if (values.rtFilter !== sj.all) n++;
    if (values.wcFilter !== sj.all) n++;
    if (values.jsErrorFilter !== sj.all) n++;
    return n;
  }, [values, sj.all]);

  const chips = useMemo(() => {
    const list: { key: keyof LinksFilterValues; label: string }[] = [];
    if (values.inlinksFilter !== sj.all) list.push({ key: 'inlinksFilter', label: values.inlinksFilter });
    if (values.statusFilter !== sj.all) list.push({ key: 'statusFilter', label: values.statusFilter });
    if (values.rtFilter !== sj.all) list.push({ key: 'rtFilter', label: values.rtFilter });
    if (values.wcFilter !== sj.all) list.push({ key: 'wcFilter', label: values.wcFilter });
    if (values.jsErrorFilter !== sj.all) list.push({ key: 'jsErrorFilter', label: values.jsErrorFilter });
    return list;
  }, [values, sj.all]);

  const searchActive = (searchQuery || '').trim().length > 0;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <div className="hidden md:block">
        <FilterSelects values={values} onChange={onChange} layout="row" />
      </div>

      <div className="md:hidden">
        <Button
          variant="secondary"
          type="button"
          onClick={() => setMobileOpen(true)}
          className="relative"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
              {activeCount}
            </span>
          ) : null}
        </Button>

        {mobileOpen ? (
          <>
            <button
              type="button"
              aria-label="Close filters"
              className="fixed inset-0 z-40 bg-[color:var(--app-overlay)]"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-brand-800 border-l border-default shadow-xl flex flex-col p-5 gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-bright">Filters</h2>
                <button type="button" onClick={() => setMobileOpen(false)} className="p-2 text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <FilterSelects values={values} onChange={onChange} layout="stack" />
              <div className="flex gap-2 mt-auto pt-4 border-t border-muted">
                {activeCount > 0 ? (
                  <Button variant="ghost" type="button" onClick={() => { onClearAll(); setMobileOpen(false); }}>
                    Clear all
                  </Button>
                ) : null}
                <Button variant="primary" type="button" className="flex-1" onClick={() => setMobileOpen(false)}>
                  Apply
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.key, sj.all)}
              className="inline-flex items-center gap-1.5 text-xs rounded-full border border-default bg-brand-800 px-2.5 py-1 text-foreground hover:bg-brand-700 transition-colors"
            >
              {chip.label}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
          {activeCount > 1 ? (
            <button type="button" onClick={onClearAll} className="text-xs text-link hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {searchActive ? (
        <AlertBanner variant="info" className="py-2 text-xs">
          Header search is combined with these filters. Clear search or filters to widen results.
        </AlertBanner>
      ) : null}
    </div>
  );
}
