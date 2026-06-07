"""Custom composed report HTML/PDF builder."""
from __future__ import annotations

import html
import io
import re
from typing import Any, Callable

from psycopg import Connection

from .export_artifacts import rows_from_tool_result
from .export_audit import (
    _category_cards_html,
    _executive_export_data,
    _executive_source_label,
    _executive_summary_html,
    _format_report_date,
    _overall_score,
    _report_html_styles,
)

_MAX_SECTIONS = 12
_NOTES_MAX_LEN = 8000

_SECTION_TABLE_KEYS = (
    "pages",
    "items",
    "paths",
    "issues",
    "issue_deltas",
    "rows",
    "keywords",
    "queries",
    "links",
    "findings",
    "deltas",
)


def _sanitize_notes(text: str) -> str:
    cleaned = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.I | re.S)
    cleaned = cleaned.replace("<", "&lt;").replace(">", "&gt;")
    return cleaned[:_NOTES_MAX_LEN]


def _table_from_rows(rows: list[dict[str, Any]], max_rows: int = 50) -> str:
    if not rows:
        return '<p class="muted">No data.</p>'
    sample = rows[:max_rows]
    keys: list[str] = []
    seen: set[str] = set()
    for row in sample:
        for k in row:
            if k not in seen:
                seen.add(k)
                keys.append(k)
    if not keys:
        return '<p class="muted">No columns.</p>'
    head = "".join(f"<th>{html.escape(k)}</th>" for k in keys[:8])
    body_rows = []
    for row in sample:
        cells = "".join(
            f"<td>{html.escape(str(row.get(k, ''))[:500])}</td>" for k in keys[:8]
        )
        body_rows.append(f"<tr>{cells}</tr>")
    note = ""
    if len(rows) > max_rows:
        note = f'<p class="muted">Showing {max_rows} of {len(rows)} rows.</p>'
    return (
        f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead>'
        f"<tbody>{''.join(body_rows)}</tbody></table></div>{note}"
    )


def _section_html_tool_result(heading: str, result: dict[str, Any]) -> str:
    h = html.escape(heading)
    if result.get("error"):
        return f"<section><h2>{h}</h2><p class=\"muted\">{html.escape(str(result['error']))}</p></section>"
    rows = rows_from_tool_result(result)
    if rows:
        return f"<section><h2>{h}</h2>{_table_from_rows(rows)}</section>"
    for key in _SECTION_TABLE_KEYS:
        raw = result.get(key)
        if isinstance(raw, list) and raw and isinstance(raw[0], dict):
            return f"<section><h2>{h}</h2>{_table_from_rows(raw)}</section>"
    preview = html.escape(str(result)[:2000])
    return f"<section><h2>{h}</h2><pre class=\"json-preview\">{preview}</pre></section>"


def _section_html_executive(payload: dict[str, Any]) -> str:
    return f"<section><h2>Executive summary</h2>{_executive_summary_html(payload)}</section>"


def _section_html_categories(payload: dict[str, Any]) -> str:
    cards = _category_cards_html(payload.get("categories") or [])
    overall = _overall_score(payload)
    score_txt = str(overall) if overall is not None else "—"
    return (
        f'<section><h2>Category scores</h2>'
        f'<p><strong>Overall health:</strong> {html.escape(score_txt)}/100</p>'
        f'<div class="score-grid">{cards}</div></section>'
    )


def _section_html_notes(heading: str, markdown: str) -> str:
    body = _sanitize_notes(markdown).replace("\n", "<br/>")
    return f"<section><h2>{html.escape(heading)}</h2><div class=\"notes\">{body}</div></section>"


def render_custom_report_html(
    *,
    title: str,
    payload: dict[str, Any],
    sections: list[dict[str, Any]],
    section_results: list[dict[str, Any] | None],
) -> str:
    site = html.escape(str(payload.get("site_name") or "Site Audit"))
    generated = html.escape(_format_report_date(str(payload.get("report_generated_at") or "")))
    title_esc = html.escape(title)
    parts: list[str] = []
    for section, result in zip(sections, section_results):
        stype = str(section.get("type") or "")
        if stype == "executive_summary":
            parts.append(_section_html_executive(payload))
        elif stype == "category_scores":
            parts.append(_section_html_categories(payload))
        elif stype == "notes":
            parts.append(_section_html_notes(
                str(section.get("heading") or "Notes"),
                str(section.get("markdown") or ""),
            ))
        elif stype == "tool" and result is not None:
            parts.append(_section_html_tool_result(
                str(section.get("heading") or section.get("tool_name") or "Section"),
                result,
            ))
    body = "\n".join(parts)
    styles = _report_html_styles()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>{title_esc} — {site}</title>
  <style>{styles}
  .score-grid {{ display: flex; flex-wrap: wrap; gap: 0.75rem; }}
  .json-preview {{ font-size: 0.75rem; overflow-x: auto; background: #f8fafc; padding: 0.75rem; }}
  .notes {{ line-height: 1.6; }}
  </style>
</head>
<body>
  <div class="report">
    <header class="cover">
      <div class="cover-brand">Site Audit</div>
      <h1>{title_esc}</h1>
      <p class="cover-subtitle">{site} · {generated}</p>
    </header>
    <div class="content">{body}</div>
  </div>
</body>
</html>"""


def render_custom_report_pdf(html_doc: str, title: str) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except ImportError as exc:
        raise RuntimeError("PDF export requires reportlab (pip install reportlab)") from exc

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.55 * inch, bottomMargin=0.55 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#0f172a"),
    )
    story: list[Any] = [
        Paragraph(html.escape(title), title_style),
        Spacer(1, 0.2 * inch),
        Paragraph(
            "Custom report generated from selected audit sections. "
            "Open the HTML export for full tables and formatting.",
            styles["Normal"],
        ),
    ]
    text = re.sub(r"<[^>]+>", " ", html_doc)
    text = re.sub(r"\s+", " ", text).strip()
    chunk_size = 3000
    for i in range(0, min(len(text), 12000), chunk_size):
        story.append(Paragraph(html.escape(text[i : i + chunk_size]), styles["Normal"]))
        story.append(Spacer(1, 0.1 * inch))
    doc.build(story)
    return buf.getvalue()


def validate_sections(sections: Any) -> tuple[list[dict[str, Any]] | None, str | None]:
    if not isinstance(sections, list) or not sections:
        return None, "sections must be a non-empty array"
    if len(sections) > _MAX_SECTIONS:
        return None, f"sections max {_MAX_SECTIONS}"
    normalized: list[dict[str, Any]] = []
    for raw in sections:
        if not isinstance(raw, dict):
            return None, "each section must be an object"
        stype = str(raw.get("type") or "")
        if stype == "tool":
            if not raw.get("tool_name"):
                return None, "tool sections require tool_name"
            normalized.append(raw)
        elif stype in ("executive_summary", "category_scores"):
            normalized.append({"type": stype})
        elif stype == "notes":
            if not raw.get("markdown"):
                return None, "notes sections require markdown"
            normalized.append(raw)
        else:
            return None, f"unknown section type: {stype}"
    return normalized, None


def resolve_section_results(
    conn: Connection,
    ctx: Any,
    payload: dict[str, Any],
    sections: list[dict[str, Any]],
    dispatch_fn: Callable[..., dict[str, Any]],
) -> list[dict[str, Any] | None]:
    results: list[dict[str, Any] | None] = []
    for section in sections:
        stype = section.get("type")
        if stype in ("executive_summary", "category_scores", "notes"):
            results.append(None)
            continue
        if stype == "tool":
            tool_args = dict(section.get("tool_args") or {})
            if ctx.property_id is not None and "property_id" not in tool_args:
                tool_args["property_id"] = ctx.property_id
            if ctx.report_id is not None and "report_id" not in tool_args:
                tool_args["report_id"] = ctx.report_id
            results.append(dispatch_fn(str(section["tool_name"]), tool_args, context=ctx, conn=conn))
            continue
        results.append(None)
    return results
