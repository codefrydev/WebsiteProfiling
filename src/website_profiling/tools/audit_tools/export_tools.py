"""Export and deliverable tools for chat and MCP."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ..export_artifacts import (
    dicts_to_csv,
    read_report_spec,
    rows_from_tool_result,
    save_artifact,
    save_report_spec,
)
from ..export_compare import export_compare_issues_csv
from ..export_custom import (
    render_custom_report_html,
    render_custom_report_pdf,
    resolve_section_results,
    validate_sections,
)
from ..export_audit import (
    export_audit_csv,
    export_audit_html,
    export_audit_json,
    export_audit_pdf,
)
from ._slice import parse_limit
from .compare_helpers import load_compare_pair
from .context import AuditToolContext

_EXPORT_FORMATS = {"pdf", "html", "csv", "json"}
_CUSTOM_FORMATS = {"html", "pdf"}
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
})

_EXPORT_TOOL_NAMES = frozenset({
    "export_audit_report",
    "export_compare_csv",
    "export_list_as_csv",
    "compose_custom_report",
    "export_custom_report",
    "list_export_formats",
})


def _dispatch(name: str, args: dict[str, Any], ctx: AuditToolContext, conn: Connection) -> dict[str, Any]:
    from .registry import dispatch_tool
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


def _tool_allowed_for_custom(tool_name: str) -> bool:
    if tool_name in _EXPORT_TOOL_NAMES:
        return False
    from .registry import tool_handler_names
    return tool_name in tool_handler_names()


def compose_custom_report(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    title = str(args.get("title") or "").strip()
    if not title:
        return {"error": "title is required"}
    sections_raw = args.get("sections")
    sections, err = validate_sections(sections_raw)
    if err:
        return {"error": err}
    assert sections is not None
    for section in sections:
        if section.get("type") == "tool":
            tname = str(section.get("tool_name") or "")
            if not _tool_allowed_for_custom(tname):
                return {"error": f"tool not allowed in custom report: {tname}"}
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    spec = {
        "title": title,
        "sections": sections,
        "property_id": scoped.property_id,
        "report_id": scoped.report_id,
    }
    spec_id = save_report_spec(spec)
    preview_html = render_custom_report_html(
        title=title,
        payload=payload,
        sections=sections,
        section_results=[None] * len(sections),
    )
    snippet = preview_html[:400].replace("\n", " ")
    return {
        "report_spec_id": spec_id,
        "section_count": len(sections),
        "preview_html_snippet": snippet,
        "title": title,
    }


def export_custom_report(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    fmt = str(args.get("format") or "html").lower().strip()
    if fmt not in _CUSTOM_FORMATS:
        return {"error": f"format must be one of: {', '.join(sorted(_CUSTOM_FORMATS))}"}
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    spec_id = args.get("report_spec_id")
    title = str(args.get("title") or "").strip()
    sections: list[dict[str, Any]] | None = None
    if spec_id:
        spec = read_report_spec(str(spec_id))
        if not spec:
            return {"error": "report_spec_id not found"}
        title = str(spec.get("title") or title or "Custom Report")
        raw_sections = spec.get("sections")
        sections, err = validate_sections(raw_sections)
        if err:
            return {"error": err}
    else:
        sections, err = validate_sections(args.get("sections"))
        if err:
            return {"error": err}
        if not title:
            return {"error": "title is required when report_spec_id is omitted"}
    assert sections is not None
    for section in sections:
        if section.get("type") == "tool":
            tname = str(section.get("tool_name") or "")
            if not _tool_allowed_for_custom(tname):
                return {"error": f"tool not allowed in custom report: {tname}"}
    section_results = resolve_section_results(conn, scoped, payload, sections, _dispatch)
    html_doc = render_custom_report_html(
        title=title,
        payload=payload,
        sections=sections,
        section_results=section_results,
    )
    safe_title = "".join(c if c.isalnum() or c in "-_" else "-" for c in title.lower())[:40] or "custom-report"
    if fmt == "html":
        filename = f"{safe_title}.html"
        return {
            **_artifact_from_bytes(html_doc, filename=filename, mime_type=_MIME["html"], extra={"format": fmt, "title": title}),
            "format": fmt,
            "title": title,
        }
    try:
        pdf_bytes = render_custom_report_pdf(html_doc, title)
    except RuntimeError as exc:
        return {"error": str(exc)}
    filename = f"{safe_title}.pdf"
    return {
        **_artifact_from_bytes(pdf_bytes, filename=filename, mime_type=_MIME["pdf"], extra={"format": fmt, "title": title}),
        "format": fmt,
        "title": title,
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
            {"tool": "compose_custom_report", "description": "Save a multi-section custom report spec"},
            {"tool": "export_custom_report", "format": "html|pdf", "description": "Render composed custom report"},
        ],
        "example_prompts": [
            "Download the audit as PDF",
            "Export broken links as CSV",
            "Compare this report to report 38 as CSV",
            "Build a client report with executive summary, category scores, and broken links",
        ],
        "notes": [
            "PDF requires reportlab (pip install reportlab)",
            "Artifacts expire after 24 hours",
            "Chat UI shows download buttons after export tools run",
        ],
    }
