"""Tool registry and dispatch for MCP and chat agent."""
from __future__ import annotations

from typing import Any, Callable

from psycopg import Connection

from ...db.storage import db_session
from .backlinks import (
    get_backlinks_velocity,
    get_bing_backlinks_summary,
    get_competitor_link_gap,
    get_gsc_latest_links,
    get_gsc_links_import_status,
    get_gsc_links_summary,
    get_gsc_sample_links,
    get_third_party_links_overlay,
)
from .charts import (
    get_crawl_summary,
    get_domain_link_distribution,
    get_issue_priority_breakdown,
    get_mime_type_breakdown,
    get_outlink_distribution,
    get_title_length_distribution,
    get_top_crawled_pages,
)
from .compare import compare_reports
from .compare_slices import (
    compare_category_deltas,
    compare_issue_deltas,
    compare_lighthouse_deltas,
    compare_link_metric_deltas,
    compare_redirect_deltas,
    compare_seo_health_deltas,
    compare_url_set_diff,
)
from .content import (
    get_content_analytics,
    get_content_duplicates,
    get_keyword_opportunities,
    get_ner_site_summary,
    get_social_coverage,
    list_thin_content_pages,
)
from .context import AuditToolContext
from .crawl import (
    get_browser_diagnostics_summary,
    get_crawl_links_table,
    get_crawl_segments,
    get_depth_distribution,
    get_graph_edges_sample,
    get_internal_links,
    get_page_analysis,
    get_page_details,
    get_response_time_stats,
    get_seo_health,
    get_status_code_breakdown,
    list_broken_links,
    list_pages_by_fetch_method,
    list_pages_with_console_errors,
    list_redirects,
    list_status_4xx_pages,
    list_status_5xx_pages,
    search_pages,
    search_pages_advanced,
)
from .google import (
    get_ga4_page_metrics,
    get_ga4_summary,
    get_google_summary,
    get_gsc_page_query_slice,
    get_gsc_top_pages,
    get_gsc_top_queries,
)
from .health import get_category_health_history, get_health_history, list_report_history
from .indexation_tools import get_indexation_coverage, get_indexation_url_join, list_indexation_gaps
from .international import get_hreflang_summary, get_language_summary
from .issues import get_category_issues, list_issues_by_category
from .keywords import (
    get_keyword_cannibalisation,
    get_keyword_history,
    get_keyword_serp_overlay,
    get_keyword_summary,
    get_query_page_misalignment,
    get_semantic_keyword_clusters,
    get_striking_distance_keywords,
    list_keywords_by_action,
    list_keywords_by_impressions,
    list_keywords_by_position,
    search_keywords,
)
from .lighthouse import (
    get_crux_summary,
    get_lighthouse_diagnostics,
    get_lighthouse_for_url,
    get_lighthouse_human_summary,
    get_lighthouse_summary,
    list_lighthouse_poor_seo_pages,
    list_slow_pages,
)
from .onpage import (
    list_content_url_issues,
    list_pages_meta_desc_too_long,
    list_pages_meta_desc_too_short,
    list_pages_missing_h1,
    list_pages_missing_meta_description,
    list_pages_missing_title,
    list_pages_multiple_h1,
    list_pages_noindex,
    list_seo_onpage_issues,
)
from .links import (
    get_link_graph_summary,
    get_outbound_link_domains,
    get_top_linked_pages,
    get_url_fingerprints,
    list_orphan_pages,
)
from .ops import (
    get_google_integration_status,
    get_integration_alerts,
    get_latest_log_analysis,
    get_property_ops,
    list_crawl_runs,
    list_log_uploads,
)
from .properties import get_property, list_properties
from .report import (
    get_category_scores,
    get_critical_issues,
    get_executive_summary,
    get_report_meta,
    get_report_summary,
    get_site_level,
    list_issues,
)
from .report_extras import (
    get_audit_recommendations,
    get_category_recommendations,
    get_ml_errors,
    get_ssl_expiry_info,
    list_audit_categories,
    list_issues_with_ai_fixes,
)
from .schema import get_schema_coverage, list_pages_without_schema, search_pages_by_schema_type
from .security import get_security_findings
from .tech import get_tech_stack_summary
from .tool_catalog import TOOL_DEFINITIONS
from .workflow import list_issue_workflow

ToolHandler = Callable[[Connection, AuditToolContext, dict[str, Any]], dict[str, Any]]

_TOOL_HANDLERS: dict[str, ToolHandler] = {
    "list_properties": list_properties,
    "get_property": get_property,
    "get_report_summary": get_report_summary,
    "get_category_scores": get_category_scores,
    "get_executive_summary": get_executive_summary,
    "get_report_meta": get_report_meta,
    "get_site_level": get_site_level,
    "list_report_history": list_report_history,
    "list_issues": list_issues,
    "get_critical_issues": get_critical_issues,
    "list_issues_by_category": list_issues_by_category,
    "get_category_issues": get_category_issues,
    "list_issue_workflow": list_issue_workflow,
    "search_pages": search_pages,
    "get_page_details": get_page_details,
    "get_internal_links": get_internal_links,
    "list_redirects": list_redirects,
    "list_broken_links": list_broken_links,
    "get_status_code_breakdown": get_status_code_breakdown,
    "get_response_time_stats": get_response_time_stats,
    "get_depth_distribution": get_depth_distribution,
    "get_crawl_segments": get_crawl_segments,
    "get_browser_diagnostics_summary": get_browser_diagnostics_summary,
    "get_schema_coverage": get_schema_coverage,
    "list_pages_without_schema": list_pages_without_schema,
    "search_pages_by_schema_type": search_pages_by_schema_type,
    "get_seo_health": get_seo_health,
    "list_orphan_pages": list_orphan_pages,
    "get_top_linked_pages": get_top_linked_pages,
    "get_outbound_link_domains": get_outbound_link_domains,
    "get_link_graph_summary": get_link_graph_summary,
    "get_url_fingerprints": get_url_fingerprints,
    "get_indexation_coverage": get_indexation_coverage,
    "get_hreflang_summary": get_hreflang_summary,
    "get_language_summary": get_language_summary,
    "get_content_analytics": get_content_analytics,
    "get_content_duplicates": get_content_duplicates,
    "get_social_coverage": get_social_coverage,
    "get_keyword_opportunities": get_keyword_opportunities,
    "get_ner_site_summary": get_ner_site_summary,
    "list_thin_content_pages": list_thin_content_pages,
    "get_keyword_summary": get_keyword_summary,
    "search_keywords": search_keywords,
    "get_striking_distance_keywords": get_striking_distance_keywords,
    "get_keyword_cannibalisation": get_keyword_cannibalisation,
    "get_query_page_misalignment": get_query_page_misalignment,
    "get_semantic_keyword_clusters": get_semantic_keyword_clusters,
    "get_keyword_history": get_keyword_history,
    "get_google_summary": get_google_summary,
    "get_gsc_top_queries": get_gsc_top_queries,
    "get_gsc_top_pages": get_gsc_top_pages,
    "get_ga4_summary": get_ga4_summary,
    "get_gsc_page_query_slice": get_gsc_page_query_slice,
    "get_gsc_links_summary": get_gsc_links_summary,
    "get_gsc_links_import_status": get_gsc_links_import_status,
    "get_competitor_link_gap": get_competitor_link_gap,
    "get_bing_backlinks_summary": get_bing_backlinks_summary,
    "get_lighthouse_summary": get_lighthouse_summary,
    "get_lighthouse_for_url": get_lighthouse_for_url,
    "get_lighthouse_diagnostics": get_lighthouse_diagnostics,
    "get_crux_summary": get_crux_summary,
    "list_slow_pages": list_slow_pages,
    "get_health_history": get_health_history,
    "compare_reports": compare_reports,
    "get_integration_alerts": get_integration_alerts,
    "get_tech_stack_summary": get_tech_stack_summary,
    "get_security_findings": get_security_findings,
    "get_audit_recommendations": get_audit_recommendations,
    "get_ml_errors": get_ml_errors,
    "get_ssl_expiry_info": get_ssl_expiry_info,
    "list_audit_categories": list_audit_categories,
    "get_category_recommendations": get_category_recommendations,
    "list_issues_with_ai_fixes": list_issues_with_ai_fixes,
    "list_seo_onpage_issues": list_seo_onpage_issues,
    "list_content_url_issues": list_content_url_issues,
    "list_pages_missing_title": list_pages_missing_title,
    "list_pages_missing_h1": list_pages_missing_h1,
    "list_pages_multiple_h1": list_pages_multiple_h1,
    "list_pages_missing_meta_description": list_pages_missing_meta_description,
    "list_pages_meta_desc_too_short": list_pages_meta_desc_too_short,
    "list_pages_meta_desc_too_long": list_pages_meta_desc_too_long,
    "list_pages_noindex": list_pages_noindex,
    "get_crawl_summary": get_crawl_summary,
    "get_issue_priority_breakdown": get_issue_priority_breakdown,
    "get_mime_type_breakdown": get_mime_type_breakdown,
    "get_title_length_distribution": get_title_length_distribution,
    "get_domain_link_distribution": get_domain_link_distribution,
    "get_outlink_distribution": get_outlink_distribution,
    "get_top_crawled_pages": get_top_crawled_pages,
    "list_indexation_gaps": list_indexation_gaps,
    "get_indexation_url_join": get_indexation_url_join,
    "get_gsc_sample_links": get_gsc_sample_links,
    "get_gsc_latest_links": get_gsc_latest_links,
    "get_third_party_links_overlay": get_third_party_links_overlay,
    "get_backlinks_velocity": get_backlinks_velocity,
    "get_property_ops": get_property_ops,
    "get_google_integration_status": get_google_integration_status,
    "list_crawl_runs": list_crawl_runs,
    "list_log_uploads": list_log_uploads,
    "get_latest_log_analysis": get_latest_log_analysis,
    "get_keyword_serp_overlay": get_keyword_serp_overlay,
    "list_keywords_by_action": list_keywords_by_action,
    "list_keywords_by_position": list_keywords_by_position,
    "list_keywords_by_impressions": list_keywords_by_impressions,
    "get_lighthouse_human_summary": get_lighthouse_human_summary,
    "list_lighthouse_poor_seo_pages": list_lighthouse_poor_seo_pages,
    "get_page_analysis": get_page_analysis,
    "search_pages_advanced": search_pages_advanced,
    "list_pages_with_console_errors": list_pages_with_console_errors,
    "list_pages_by_fetch_method": list_pages_by_fetch_method,
    "get_crawl_links_table": get_crawl_links_table,
    "get_graph_edges_sample": get_graph_edges_sample,
    "list_status_4xx_pages": list_status_4xx_pages,
    "list_status_5xx_pages": list_status_5xx_pages,
    "get_ga4_page_metrics": get_ga4_page_metrics,
    "get_category_health_history": get_category_health_history,
    "compare_issue_deltas": compare_issue_deltas,
    "compare_category_deltas": compare_category_deltas,
    "compare_seo_health_deltas": compare_seo_health_deltas,
    "compare_lighthouse_deltas": compare_lighthouse_deltas,
    "compare_url_set_diff": compare_url_set_diff,
    "compare_redirect_deltas": compare_redirect_deltas,
    "compare_link_metric_deltas": compare_link_metric_deltas,
}


def dispatch_tool(
    name: str,
    args: dict[str, Any] | None,
    *,
    context: AuditToolContext | None = None,
    conn: Connection | None = None,
) -> dict[str, Any]:
    """Run a tool by name. Uses db_session when conn is not provided."""
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}

    ctx = context or AuditToolContext()
    payload_args = dict(args or {})
    merged_ctx = ctx.with_args(payload_args)

    if conn is not None:
        return handler(conn, merged_ctx, payload_args)

    with db_session() as session:
        return handler(session, merged_ctx, payload_args)


def openai_tools_schema() -> list[dict[str, Any]]:
    """Convert TOOL_DEFINITIONS to OpenAI function-calling format."""
    out: list[dict[str, Any]] = []
    for tool in TOOL_DEFINITIONS:
        out.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
            },
        })
    return out


def tool_handler_names() -> set[str]:
    return set(_TOOL_HANDLERS.keys())
