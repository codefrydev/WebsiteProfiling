import type { ExportColumn } from '@/types/components';
import type { GscLinksReportData } from '@/types/report';

export {
  PAGE_SIZE,
  paginateSlice,
  filterBySearch,
  exportCsv,
} from '../google/tableUtils';

export function buildDomainExportColumns(
  table: Record<string, string>,
): ExportColumn[] {
  return [
    { key: 'site', label: table.site },
    { key: 'link_count', label: table.links },
    { key: 'target_page_count', label: table.targetPages },
  ];
}

export function buildLinkedPageExportColumns(
  table: Record<string, string>,
): ExportColumn[] {
  return [
    { key: 'target_page', label: table.targetPage },
    { key: 'link_count', label: table.links },
    { key: 'linking_site_count', label: table.linkingSites },
  ];
}

export function buildAnchorExportColumns(table: Record<string, string>): ExportColumn[] {
  return [
    { key: 'anchor_text', label: table.anchorText },
    { key: 'link_count', label: table.links },
  ];
}

export function buildSampleLinkExportColumns(
  table: Record<string, string>,
): ExportColumn[] {
  return [
    { key: 'source_page', label: table.sourcePage },
    { key: 'target_page', label: table.targetPage },
    { key: 'anchor_text', label: table.anchorText },
    { key: 'linking_site', label: table.site },
    { key: 'discovered_at', label: table.discovered },
  ];
}

export function combinedSampleLinks(data: GscLinksReportData | undefined) {
  const sample = (data?.sample_links ?? []).map((r) => ({ ...r, link_kind: 'sample' }));
  const latest = (data?.latest_links ?? []).map((r) => ({ ...r, link_kind: 'latest' }));
  return [...sample, ...latest];
}

export function hasGscLinksExportType(
  data: GscLinksReportData | undefined,
  exportType: string,
): boolean {
  return (data?.export_types ?? []).includes(exportType);
}

export function summaryCounts(data: GscLinksReportData | undefined) {
  const rowCounts = data?.row_counts ?? {};
  return {
    referringDomains:
      Number(rowCounts.top_linking_sites) || data?.top_linking_sites?.length || 0,
    linkedPages:
      Number(rowCounts.top_linked_pages) || data?.top_linked_pages?.length || 0,
    sampleLinks:
      Number(data?.sample_links_full_count) || data?.sample_links?.length || 0,
    latestLinks:
      Number(data?.latest_links_full_count) || data?.latest_links?.length || 0,
    hasSampleExport: hasGscLinksExportType(data, 'sample_links'),
    hasLatestExport: hasGscLinksExportType(data, 'latest_links'),
  };
}
