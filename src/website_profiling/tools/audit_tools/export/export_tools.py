"""Export and deliverable tools for chat and MCP."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...export_artifacts import (
    dicts_to_csv,
    rows_from_tool_result,
    save_artifact,
)
from ...export_compare import export_compare_issues_csv
from ...export_audit import (
    export_audit_csv,
    export_audit_html,
    export_audit_json,
    export_audit_pdf,
)
from .._slice import parse_limit
from ..compare.compare_helpers import load_compare_pair
from ..context import AuditToolContext

_EXPORT_FORMATS = {"pdf", "html", "csv", "json"}
_MIME = {
    "pdf": "application/pdf",
    "html": "text/html; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
    "json": "application/json; charset=utf-8",
}
_EXT = {"pdf": "pdf", "html": "html", "csv": "csv", "json": "json"}

_LIST_EXPORT_ALLOWLIST = frozenset({
    "list_issues",
    "search_issues",
    "list_issues_by_category",
    "list_issues_with_ai_fixes",
    "list_seo_onpage_issues",
    "list_content_url_issues",
    "list_pages_missing_title",
    "list_pages_missing_h1",
    "list_pages_multiple_h1",
    "list_pages_missing_meta_description",
    "list_pages_meta_desc_too_short",
    "list_pages_meta_desc_too_long",
    "list_pages_noindex",
    "list_redirects",
    "list_broken_links",
    "list_broken_link_sources",
    "list_status_4xx_pages",
    "list_status_5xx_pages",
    "list_orphan_pages",
    "list_thin_content_pages",
    "list_pages_missing_canonical",
    "list_canonical_mismatch",
    "list_pages_with_missing_alt",
    "list_pages_without_lazy_images",
    "list_pages_with_images_missing_dimensions",
    "list_site_image_urls",
    "list_largest_images",
    "list_unoptimized_images",
    "list_images_needing_attention",
    "list_pages_skipped_headings",
    "list_pages_missing_viewport",
    "list_long_redirect_chains",
    "list_robots_blocked_urls",
    "list_pages_missing_og_image",
    "list_pages_by_technology",
    "list_pages_with_console_errors",
    "list_pages_by_fetch_method",
    "list_security_findings_by_type",
    "list_indexation_gaps",
    "list_keywords_by_action",
    "list_keywords_by_position",
    "list_keywords_by_impressions",
    "list_lighthouse_poor_seo_pages",
    "list_lighthouse_poor_accessibility_pages",
    "list_lighthouse_poor_best_practices_pages",
    "list_lighthouse_cwv_failures",
    "list_slow_pages",
    "list_log_only_paths",
    "list_crawl_only_paths",
    "compare_issue_deltas",
    "compare_redirect_deltas",
    "compare_lighthouse_deltas",
    "get_log_top_paths",
    "get_top_pages_by_pagerank",
    "get_top_crawled_pages",
    "get_top_linked_pages",
    "search_pages",
    "search_pages_advanced",
    "search_keywords",
    "search_pages_by_schema_type",
    "list_pages_without_schema",
    "list_pages_title_too_short",
    "list_pages_title_too_long",
    "list_pages_slow_response",
    "list_pages_missing_html_lang",
    "list_pages_invalid_viewport",
    "list_pages_color_contrast_failures",
    "list_pages_high_reading_level",
    "list_pages_very_thin_content",
    "list_hreflang_issue_pages",
    "list_pages_missing_og_tags",
    "list_pages_missing_twitter_cards",
    "list_pages_invalid_json_ld",
    "list_pages_mixed_language",
    "list_orphan_hub_suggestions",
    "list_lighthouse_failure_lcp",
    "list_lighthouse_failure_inp",
    "list_lighthouse_failure_cls",
    "list_lighthouse_failure_seo",
    "list_pages_console_errors_by_type",
    "list_pages_js_rendering_delta",
    "list_gsc_pages_by_impressions",
    "list_gsc_pages_by_clicks",
    "list_gsc_queries_by_impressions",
    "list_gsc_queries_by_clicks",
    "list_gsc_ctr_underperformers",
    "list_gsc_decaying_pages",
    "list_gsc_decaying_queries",
    "list_gsc_new_queries",
    "list_ga4_landing_pages",
    "list_ga4_pages_by_bounce_rate",
    "list_ga4_pages_by_engagement_rate",
    "list_gsc_ga4_mismatch_pages",
    "list_gsc_pages_by_position_band",
    "list_gsc_branded_queries",
    "list_gsc_non_branded_queries",
    "list_keyword_rank_improvements",
    "list_keyword_rank_declines",
    "list_keywords_new_to_top_10",
    "list_keywords_fell_out_of_top_10",
    "list_cannibalisation_queries",
    "list_cannibalisation_urls",
    "list_misaligned_queries",
    "list_keywords_by_recommended_action",
    "list_keywords_by_serp_feature",
    "list_semantic_cluster_pages",
    "list_semantic_cluster_queries",
    "list_keywords_near_page_one",
    "list_keywords_high_impression_zero_click",
    "list_keywords_by_competition_band",
    "list_keywords_with_ai_overview",
    "list_keywords_local_pack",
    "list_keywords_question_intent",
    "list_keywords_commercial_intent",
    "list_referring_domains",
    "list_backlinks_by_anchor_text",
    "list_backlinks_to_url",
    "list_backlinks_from_domain",
    "list_outbound_links",
    "list_internal_links_from_url",
    "list_internal_links_to_url",
    "list_links_by_rel_nofollow",
    "list_pagerank_low_pages",
    "list_indexation_submitted_not_indexed",
    "list_indexation_indexed_not_submitted",
    "list_sitemap_urls_not_in_crawl",
    "list_crawl_urls_not_in_sitemap",
    "list_log_paths_by_hits",
    "list_log_5xx_paths",
    "list_log_googlebot_low_crawl",
    "list_log_orphan_high_traffic",
    "list_redirect_chains_by_length",
    "list_hreflang_reciprocal_gaps",
    "list_pages_containing_keyword",
    "list_pages_by_word_count_band",
    "list_duplicate_content_pairs",
    "list_spell_check_issues",
    "list_html_validation_issues",
    "list_amp_validation_issues",
    "list_pagination_issues",
    "list_schema_errors_by_type",
    "list_pages_missing_article_schema",
    "list_pages_missing_howto_schema",
    "list_pages_ai_citation_signals",
    "list_pages_missing_llms_txt_reference",
    "list_robots_blocked_ai_crawlers",
    "list_compare_new_issues",
    "list_compare_resolved_issues",
    "list_compare_new_urls",
    "list_compare_removed_urls",
    "list_compare_lighthouse_regressions",
    "list_compare_traffic_losers",
})

_EXPORT_TOOL_NAMES = frozenset({
    "export_audit_report",
    "export_compare_csv",
    "export_list_as_csv",
    "list_export_formats",
})


def _dispatch(name: str, args: dict[str, Any], ctx: AuditToolContext, conn: Connection) -> dict[str, Any]:
    from ..registry import dispatch_tool
    return dispatch_tool(name, args, context=ctx, conn=conn)


def _artifact_from_bytes(
    data: bytes | str,
    *,
    filename: str,
    mime_type: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return save_artifact(data, filename=filename, mime_type=mime_type, meta=extra)


def export_audit_report(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    fmt = str(args.get("format") or "pdf").lower().strip()
    if fmt not in _EXPORT_FORMATS:
        return {"error": f"format must be one of: {', '.join(sorted(_EXPORT_FORMATS))}"}
    report_id = scoped.report_id
    try:
        if fmt == "pdf":
            data = export_audit_pdf(report_id)
            filename = f"audit-export.{_EXT[fmt]}"
            return {
                **_artifact_from_bytes(data, filename=filename, mime_type=_MIME[fmt], extra={"format": fmt, "report_id": report_id}),
                "format": fmt,
                "report_id": report_id,
            }
        if fmt == "html":
            data = export_audit_html(report_id)
        elif fmt == "csv":
            data = export_audit_csv(report_id)
        else:
            data = export_audit_json(report_id)
        filename = f"audit-export.{_EXT[fmt]}"
        return {
            **_artifact_from_bytes(data, filename=filename, mime_type=_MIME[fmt], extra={"format": fmt, "report_id": report_id}),
            "format": fmt,
            "report_id": report_id,
        }
    except FileNotFoundError:
        return {"error": "no report found"}
    except RuntimeError as exc:
        return {"error": str(exc)}


def export_compare_csv(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    csv_text = export_compare_issues_csv(current, baseline)
    filename = f"audit-compare-{cur_rid}-vs-{base_rid}.csv"
    return {
        **_artifact_from_bytes(csv_text, filename=filename, mime_type=_MIME["csv"], extra={"baseline_report_id": base_rid, "report_id": cur_rid}),
        "current_report_id": cur_rid,
        "baseline_report_id": base_rid,
        "format": "csv",
    }


def export_list_as_csv(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    tool_name = str(args.get("tool_name") or "").strip()
    if not tool_name:
        return {"error": "tool_name is required"}
    if tool_name not in _LIST_EXPORT_ALLOWLIST:
        return {"error": f"tool_name not allowed for CSV export: {tool_name}"}
    tool_args = dict(args.get("tool_args") or {})
    limit = parse_limit(args.get("limit"), 100, 500)
    tool_args["limit"] = limit
    scoped = ctx.with_args({**tool_args, **{k: v for k, v in args.items() if k in ("property_id", "report_id")}})
    if scoped.property_id is not None and "property_id" not in tool_args:
        tool_args["property_id"] = scoped.property_id
    if scoped.report_id is not None and "report_id" not in tool_args:
        tool_args["report_id"] = scoped.report_id
    result = _dispatch(tool_name, tool_args, scoped, conn)
    if result.get("error"):
        return result
    rows = rows_from_tool_result(result)
    if not rows:
        return {"error": "tool returned no exportable rows", "tool_name": tool_name}
    columns_raw = args.get("columns")
    columns = [str(c) for c in columns_raw if c] if isinstance(columns_raw, list) else None
    csv_text = dicts_to_csv(rows, columns)
    filename = f"{tool_name}.csv"
    return {
        **_artifact_from_bytes(
            csv_text,
            filename=filename,
            mime_type=_MIME["csv"],
            extra={"tool_name": tool_name, "row_total": len(rows)},
        ),
        "tool_name": tool_name,
        "total": len(rows),
        "format": "csv",
    }


def list_export_formats(_conn: Connection, _ctx: AuditToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    return {
        "formats": [
            {"tool": "export_audit_report", "format": "pdf", "description": "Full audit PDF deliverable"},
            {"tool": "export_audit_report", "format": "html", "description": "Full audit HTML preview/print"},
            {"tool": "export_audit_report", "format": "csv", "description": "Full audit CSV (URLs + issues)"},
            {"tool": "export_audit_report", "format": "json", "description": "Full audit JSON payload"},
            {"tool": "export_compare_csv", "format": "csv", "description": "Issue added/removed diff between two reports"},
            {"tool": "export_list_as_csv", "format": "csv", "description": "CSV from any allowlisted list tool result"},
        ],
        "example_prompts": [
            "Download the audit as PDF",
            "Export broken links as CSV",
            "Compare this report to report 38 as CSV",
        ],
        "notes": [
            "PDF requires reportlab (pip install reportlab)",
            "Artifacts expire after 24 hours",
            "Chat UI shows download buttons after export tools run",
        ],
    }
