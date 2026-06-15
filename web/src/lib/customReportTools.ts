/** Tools allowed in custom report builder UI (subset of audit-tool allowlist). */
export const CUSTOM_REPORT_TOOLS = [
  { value: 'get_report_summary', label: 'Report summary' },
  { value: 'get_category_scores', label: 'Category scores' },
  { value: 'get_critical_issues', label: 'Critical issues' },
  { value: 'list_broken_links', label: 'Broken links' },
  { value: 'get_lighthouse_summary', label: 'Lighthouse summary' },
  { value: 'get_google_summary', label: 'Google summary' },
  { value: 'get_image_audit_summary', label: 'Image audit summary' },
  { value: 'get_geo_readiness_score', label: 'GEO readiness score' },
  { value: 'get_axe_audit_summary', label: 'Axe accessibility summary' },
] as const;

export type CustomSectionType = 'executive_summary' | 'category_scores' | 'tool' | 'notes';

export interface CustomReportSection {
  id: string;
  type: CustomSectionType;
  tool_name?: string;
  markdown?: string;
}

export const CUSTOM_SECTION_TYPES: { value: CustomSectionType; label: string }[] = [
  { value: 'executive_summary', label: 'Executive summary' },
  { value: 'category_scores', label: 'Category scores' },
  { value: 'tool', label: 'Audit data (tool)' },
  { value: 'notes', label: 'Notes' },
];

export function sectionsToPayload(sections: CustomReportSection[]): Array<Record<string, unknown>> {
  return sections.map((s) => {
    if (s.type === 'tool') {
      return { type: 'tool', tool_name: s.tool_name || 'get_report_summary' };
    }
    if (s.type === 'notes') {
      return { type: 'notes', markdown: s.markdown || '' };
    }
    return { type: s.type };
  });
}
