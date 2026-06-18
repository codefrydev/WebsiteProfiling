/** Audit tools exposed to the report UI via POST /api/report/audit-tool. */
export const AUDIT_TOOL_ALLOWLIST = new Set([
  // Image SEO
  'get_image_audit_summary',
  'list_pages_with_missing_alt',
  'list_pages_with_images_missing_dimensions',
  'list_pages_without_lazy_images',
  'list_unoptimized_images',
  'list_largest_images',
  // Accessibility (axe)
  'get_axe_audit_summary',
  'list_pages_with_axe_violations',
  // GEO / AEO
  'get_geo_readiness_score',
  'get_llms_txt_status',
  'get_faq_schema_coverage',
  'list_pages_missing_faq_schema',
  'get_eeat_signals_summary',
  'get_report_summary',
  'get_category_scores',
  'get_critical_issues',
  'list_broken_links',
  'get_lighthouse_summary',
  'get_google_summary',
]);

export function isAllowedAuditTool(name: string): boolean {
  return AUDIT_TOOL_ALLOWLIST.has(name);
}
