'use client';

import { type MouseEvent, type RefObject } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import type { ReportLink } from '@/types';
import { strings, format } from '@/lib/strings';
import { Card, Badge, Button } from '@/components';
import { formatMs, rtColor, formatPageHrefLines } from '@/utils/linkUtils';
import { linkHasBrowserErrors } from '@/lib/browserErrors';
import { collectCustomFieldKeys, parseLinkCustomFields } from '@/lib/customFields';
import { SortTh, RowTooltip, LinksFilterBar, InlinksMetricCell } from '@/components/links';
import SavedCrawlFiltersBar from '@/components/links/SavedCrawlFiltersBar';
import type { LinksFilterValues } from '@/components/links/LinksFilterBar';
import type { LinkSortKey } from './types';
import { LinksExplorerTabPanel } from './LinksExplorerTabPanel';

export interface LinksExplorerTableTabProps {
  filterValues: LinksFilterValues;
  onFilterChange: (key: keyof LinksFilterValues, value: string) => void;
  onClearAllFilters: () => void;
  propertyId?: number;
  onLoadSavedFilter?: (values: LinksFilterValues) => void;
  searchQuery: string;
  filtered: ReportLink[];
  pageLinks: ReportLink[];
  links: ReportLink[];
  page: number;
  totalPages: number;
  sortBy: LinkSortKey;
  sortDesc: boolean;
  onToggleSort: (key: string) => void;
  onPagePrev: () => void;
  onPageNext: () => void;
  maxInlinksInResults: number;
  onInspect: (url: string, initialTab: string) => void;
  hoveredRow: string | null;
  tooltipPos: { top: number; left: number };
  tableRef: RefObject<HTMLDivElement | null>;
  onRowMouseEnter: (e: MouseEvent<HTMLTableRowElement>, link: ReportLink) => void;
  onRowMouseLeave: () => void;
}

export function LinksExplorerTableTab({
  filterValues,
  onFilterChange,
  onClearAllFilters,
  propertyId = 0,
  onLoadSavedFilter,
  searchQuery,
  filtered,
  pageLinks,
  links,
  page,
  totalPages,
  sortBy,
  sortDesc,
  onToggleSort,
  onPagePrev,
  onPageNext,
  maxInlinksInResults,
  onInspect,
  hoveredRow,
  tooltipPos,
  tableRef,
  onRowMouseEnter,
  onRowMouseLeave,
}: LinksExplorerTableTabProps) {
  const vl = strings.views.links;
  const sj = strings.common;
  const hasCustomExtract = links.some((l) => l.custom_extract);
  const customFieldKeys = collectCustomFieldKeys(links);

  return (
    <LinksExplorerTabPanel tabId="urls" className="flex flex-col gap-4">
      <LinksFilterBar
        values={filterValues}
        onChange={onFilterChange}
        onClearAll={onClearAllFilters}
        searchQuery={searchQuery}
      />
      {onLoadSavedFilter ? (
        <SavedCrawlFiltersBar
          propertyId={propertyId}
          filterValues={filterValues}
          onLoad={onLoadSavedFilter}
        />
      ) : null}

      <Card overflowHidden padding="none" className="flex flex-col min-h-[min(500px,70vh)] sm:min-h-[500px]">
        <div
          className="overflow-x-auto overflow-y-visible touch-pan-x overscroll-x-contain relative scroll-smooth"
          ref={tableRef}
        >
          {hoveredRow && (() => {
            const link = links.find((l) => l.url === hoveredRow);
            return link ? (
              <RowTooltip link={link} style={{ position: 'absolute', top: tooltipPos.top, left: tooltipPos.left }} />
            ) : null;
          })()}

          <p className="sm:hidden text-xs text-muted-foreground px-3 py-2 border-b border-muted bg-brand-900/40">
            {sj.tableSwipeHint}
          </p>

          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-brand-900 uppercase text-xs font-semibold sticky top-0 z-20 shadow-sm">
              <tr>
                <SortTh
                  label={vl.thPage}
                  field="url"
                  sortBy={sortBy}
                  sortDesc={sortDesc}
                  onSort={onToggleSort}
                  className="px-3 sm:px-6 sticky left-0 z-30 bg-brand-900 border-r border-default shadow-[4px_0_16px_-8px_rgba(0,0,0,0.55)]"
                />
                <SortTh label={vl.thStatus} field="status" sortBy={sortBy} sortDesc={sortDesc} onSort={onToggleSort} />
                <SortTh label={vl.thLinksIn} field="inlinks" sortBy={sortBy} sortDesc={sortDesc} onSort={onToggleSort} />
                <SortTh
                  label={vl.thCrawlDepth}
                  field="depth"
                  sortBy={sortBy}
                  sortDesc={sortDesc}
                  onSort={onToggleSort}
                  className="hidden md:table-cell"
                />
                <SortTh label={vl.thLoadTime} field="response_time_ms" sortBy={sortBy} sortDesc={sortDesc} onSort={onToggleSort} />
                <SortTh
                  label={vl.thWords}
                  field="word_count"
                  sortBy={sortBy}
                  sortDesc={sortDesc}
                  onSort={onToggleSort}
                  className="hidden md:table-cell"
                />
                {hasCustomExtract ? (
                  <th className="hidden lg:table-cell px-4 py-4 text-muted-foreground uppercase text-xs whitespace-nowrap">
                    {vl.thCustomExtract}
                  </th>
                ) : null}
                {customFieldKeys.map((key) => (
                  <th
                    key={key}
                    className="hidden xl:table-cell px-4 py-4 text-muted-foreground uppercase text-xs whitespace-nowrap"
                  >
                    {key}
                  </th>
                ))}
                <th className="hidden lg:table-cell px-4 py-4 text-muted-foreground uppercase text-xs whitespace-nowrap">
                  {vl.thJsErrors}
                </th>
                <th className="px-3 sm:px-4 py-4 text-center text-muted-foreground uppercase text-xs whitespace-nowrap">
                  {vl.thActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted [&>tr:nth-child(even)]:bg-brand-900/30">
              {pageLinks.map((link, i) => {
                const hrefLines = formatPageHrefLines(link.url);
                const stickyBg = i % 2 === 1 ? 'bg-brand-900/40' : 'bg-brand-800';
                return (
                  <tr
                    key={link.url}
                    className="hover:bg-brand-800/80 transition-colors cursor-default"
                    onMouseEnter={(e) => onRowMouseEnter(e, link)}
                    onMouseLeave={onRowMouseLeave}
                  >
                    <td
                      className={`px-3 sm:px-6 py-3 align-top min-w-0 sticky left-0 z-10 border-r border-default shadow-[4px_0_16px_-8px_rgba(0,0,0,0.5)] max-w-[min(280px,85vw)] ${stickyBg}`}
                    >
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div
                          className="text-bright font-medium text-sm leading-snug line-clamp-2"
                          title={link.title || undefined}
                        >
                          {link.title ? (
                            link.title
                          ) : (
                            <span className="text-muted-foreground italic font-normal">{vl.noTitle}</span>
                          )}
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-link group min-w-0"
                          title={link.url}
                        >
                          <span className="truncate font-mono">{hrefLines.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </a>
                        {(link.depth != null || (link.word_count ?? 0) > 0) && (
                          <p className="mt-1 md:hidden text-[11px] text-muted-foreground leading-snug">
                            {link.depth != null && (
                              <span>
                                {vl.thCrawlDepth}: {String(link.depth)}
                              </span>
                            )}
                            {link.depth != null && (link.word_count ?? 0) > 0 && (
                              <span className="mx-1.5 text-muted-foreground">·</span>
                            )}
                            {(link.word_count ?? 0) > 0 && (
                              <span>
                                {vl.thWords}: {(link.word_count ?? 0).toLocaleString()}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle">
                      <Badge value={link.status ?? ''} />
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right align-middle min-w-0">
                      <InlinksMetricCell count={link.inlinks ?? 0} maxInSection={maxInlinksInResults} />
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-foreground text-sm tabular-nums whitespace-nowrap align-middle">
                      {link.depth != null ? link.depth : sj.emDash}
                    </td>
                    <td
                      className={`px-3 sm:px-4 py-3 text-sm font-semibold tabular-nums whitespace-nowrap align-middle ${rtColor(link.response_time_ms)}`}
                    >
                      {formatMs(link.response_time_ms)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-foreground tabular-nums whitespace-nowrap align-middle">
                      {(link.word_count ?? 0) > 0 ? (link.word_count ?? 0).toLocaleString() : sj.emDash}
                    </td>
                    {hasCustomExtract ? (
                      <td className="hidden lg:table-cell px-4 py-3 text-xs text-foreground align-middle max-w-[12rem] truncate" title={link.custom_extract}>
                        {link.custom_extract || sj.emDash}
                      </td>
                    ) : null}
                    {customFieldKeys.map((key) => {
                      const value = parseLinkCustomFields(link)[key];
                      return (
                        <td
                          key={key}
                          className="hidden xl:table-cell px-4 py-3 text-xs text-foreground align-middle max-w-[10rem] truncate"
                          title={value}
                        >
                          {value || sj.emDash}
                        </td>
                      );
                    })}
                    <td className="hidden lg:table-cell px-4 py-3 text-xs align-middle whitespace-nowrap">
                      {linkHasBrowserErrors(link) ? (
                        <span className="inline-flex items-center rounded-md bg-red-500/10 border border-red-500/25 px-2 py-0.5 font-mono text-red-700 dark:text-red-300">
                          {format(vl.jsErrorBadge, {
                            console: link.console_error_count ?? 0,
                            page: link.page_error_count ?? 0,
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{sj.emDash}</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          onInspect(link.url, linkHasBrowserErrors(link) ? 'analysis' : 'overview')
                        }
                        className="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-[2.75rem] sm:min-h-0 sm:min-w-0 text-muted-foreground hover:text-bright bg-brand-800 hover:bg-brand-700 px-3 py-2.5 sm:px-2 sm:py-1 rounded-lg sm:rounded text-xs font-medium transition-colors touch-manipulation"
                      >
                        <Search className="h-4 w-4 sm:h-3 sm:w-3 shrink-0" /> {vl.inspect}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-muted bg-brand-900 flex justify-between items-center shrink-0">
          <div className="text-sm text-muted-foreground">
            {vl.pageOf} <span className="font-bold text-bright">{page}</span> {vl.of}{' '}
            <span className="font-bold text-bright">{totalPages}</span>
            <span className="hidden sm:inline text-muted-foreground">
              {' '}
              · {filtered.length.toLocaleString()} {vl.resultsSuffix.trim()}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onPagePrev} disabled={page <= 1} className="px-3 py-1 text-foreground">
              {vl.previous}
            </Button>
            <Button variant="secondary" onClick={onPageNext} disabled={page >= totalPages} className="px-3 py-1 text-foreground">
              {vl.next}
            </Button>
          </div>
        </div>
      </Card>
    </LinksExplorerTabPanel>
  );
}
