"""Export audit payload to CSV, JSON, HTML (preview/print), and PDF."""
from __future__ import annotations

import csv
import html
import io
import json
from datetime import datetime, timezone
from typing import Any, Optional

from ..db import db_session, read_report_payload
from ..reporting.terminology import category_display_name

_GLOSSARY_ROWS: list[tuple[str, str]] = [
    ("Crawl", "URLs fetched by the site spider (status codes, titles, inlinks)."),
    ("Lighthouse", "Lab Core Web Vitals audit (LCP, CLS, TBT, and category scores)."),
    ("Google Search Console", "Queries, pages, clicks, impressions, and average position from GSC."),
    ("Google Analytics 4", "Sessions, users, and engagement from GA4."),
    ("Estimated", "Derived from crawl text only — not Google search volume or rankings."),
    ("AI insights", "Optional LLM summaries — verify before client delivery."),
]

_ISSUE_LIMIT_HTML = 200
_ISSUE_LIMIT_PDF = 80
_LINK_LIMIT = 50


def _load_payload(report_id: Optional[int] = None) -> dict[str, Any]:
    with db_session() as conn:
        payload = read_report_payload(conn, report_id)
    if not payload:
        raise FileNotFoundError("No report payload found")
    return payload


def _issues_rows(payload: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cat_name = str(cat.get("name") or "")
        ui_name = category_display_name(cat_name)
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            rows.append({
                "category": ui_name,
                "priority": str(issue.get("priority") or ""),
                "message": str(issue.get("message") or ""),
                "url": str(issue.get("url") or ""),
                "recommendation": str(issue.get("recommendation") or ""),
            })
    return rows


def _priority_sort_key(row: dict[str, str]) -> int:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return order.get(row["priority"].lower(), 9)


def _summary_lines(payload: dict[str, Any]) -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []
    site = str(payload.get("site_name") or "Site")
    lines.append(("Property", site))
    if payload.get("report_generated_at"):
        lines.append(("Report generated", str(payload["report_generated_at"])))
    meta = payload.get("report_meta") or {}
    if isinstance(meta, dict):
        sources = meta.get("data_sources") or []
        if sources:
            lines.append(("Data sources", ", ".join(str(s) for s in sources)))
        scope = meta.get("crawl_scope") or {}
        if isinstance(scope, dict) and scope.get("pages_crawled") is not None:
            pages = scope.get("pages_crawled")
            max_p = scope.get("max_pages_configured")
            scope_txt = f"{pages} pages crawled"
            if max_p:
                scope_txt += f" (limit {max_p})"
            if scope.get("crawl_limited"):
                scope_txt += " — crawl limit reached"
            lines.append(("Crawl scope", scope_txt))
        if meta.get("google_fetched_at"):
            lines.append(("Google data fetched", str(meta["google_fetched_at"])))
    summary = payload.get("summary") or {}
    if isinstance(summary, dict):
        for key, label in (
            ("total_urls", "URLs in crawl"),
            ("indexable", "Indexable URLs"),
            ("issues_count", "Total issues"),
            ("critical_issues", "Critical issues"),
        ):
            if summary.get(key) is not None:
                lines.append((label, str(summary[key])))
    status = payload.get("status_counts") or {}
    if isinstance(status, dict) and status:
        parts = [f"{k}: {v}" for k, v in sorted(status.items(), key=lambda x: -int(x[1] or 0))[:8]]
        lines.append(("HTTP status mix", ", ".join(parts)))
    return lines


def export_audit_csv(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["# Site Audit export"])
    w.writerow(["site_name", payload.get("site_name", "")])
    w.writerow(["report_generated_at", payload.get("report_generated_at", "")])
    meta = payload.get("report_meta") or {}
    if meta:
        w.writerow(["data_sources", ", ".join(meta.get("data_sources") or [])])
    w.writerow([])
    w.writerow(["url", "status", "title", "inlinks", "word_count"])
    for link in payload.get("links") or []:
        if not isinstance(link, dict):
            continue
        w.writerow([
            link.get("url", ""),
            link.get("status", ""),
            link.get("title", ""),
            link.get("inlinks", ""),
            link.get("word_count", ""),
        ])
    w.writerow([])
    w.writerow(["category", "priority", "message", "url", "recommendation"])
    for row in _issues_rows(payload):
        w.writerow([row["category"], row["priority"], row["message"], row["url"], row["recommendation"]])
    return buf.getvalue()


def export_audit_json(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    return json.dumps(payload, indent=2, default=str)


def export_audit_html(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    site = html.escape(str(payload.get("site_name") or "Site Audit"))
    generated = html.escape(str(payload.get("report_generated_at") or ""))
    issues = sorted(_issues_rows(payload), key=_priority_sort_key)[:_ISSUE_LIMIT_HTML]
    issue_total = len(_issues_rows(payload))
    links = [l for l in (payload.get("links") or []) if isinstance(l, dict)][:_LINK_LIMIT]

    summary_html = "".join(
        f"<tr><th>{html.escape(k)}</th><td>{html.escape(v)}</td></tr>"
        for k, v in _summary_lines(payload)
    )

    issue_rows = ""
    for row in issues:
        issue_rows += (
            "<tr>"
            f"<td>{html.escape(row['category'])}</td>"
            f"<td><span class=\"pri pri-{html.escape(row['priority'].lower())}\">"
            f"{html.escape(row['priority'])}</span></td>"
            f"<td>{html.escape(row['message'])}</td>"
            f"<td class=\"url\">{html.escape(row['url'])}</td>"
            f"<td>{html.escape(row['recommendation'])}</td>"
            "</tr>"
        )

    link_rows = ""
    for link in links:
        link_rows += (
            "<tr>"
            f"<td class=\"url\">{html.escape(str(link.get('url') or ''))}</td>"
            f"<td>{html.escape(str(link.get('status') or ''))}</td>"
            f"<td>{html.escape(str(link.get('title') or ''))}</td>"
            f"<td>{html.escape(str(link.get('inlinks') or ''))}</td>"
            f"<td>{html.escape(str(link.get('word_count') or ''))}</td>"
            "</tr>"
        )

    glossary = "".join(
        f"<tr><td><strong>{html.escape(term)}</strong></td><td>{html.escape(desc)}</td></tr>"
        for term, desc in _GLOSSARY_ROWS
    )

    recs = payload.get("recommendations") or []
    rec_html = ""
    if isinstance(recs, list) and recs:
        items = "".join(f"<li>{html.escape(str(r))}</li>" for r in recs[:15])
        rec_html = f"<section><h2>Recommendations</h2><ul>{items}</ul></section>"

    truncated_note = ""
    if issue_total > len(issues):
        truncated_note = (
            f"<p class=\"muted\">Showing {len(issues)} of {issue_total} issues. "
            "Use CSV/JSON export for the full list.</p>"
        )

    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Site Audit — {site}</title>
<style>
  :root {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; }}
  body {{ margin: 2rem; max-width: 960px; line-height: 1.45; }}
  h1 {{ font-size: 1.5rem; margin-bottom: 0.25rem; }}
  h2 {{ font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.35rem; }}
  .meta {{ color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }}
  th, td {{ border: 1px solid #e5e5e5; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }}
  th {{ background: #f5f5f5; }}
  .url {{ word-break: break-all; max-width: 280px; }}
  .pri {{ font-weight: 600; text-transform: capitalize; }}
  .pri-critical {{ color: #b91c1c; }}
  .pri-high {{ color: #c2410c; }}
  .pri-medium {{ color: #a16207; }}
  .pri-low {{ color: #4b5563; }}
  .muted {{ color: #666; font-size: 0.85rem; }}
  @media print {{
    body {{ margin: 1cm; }}
    a {{ color: inherit; text-decoration: none; }}
  }}
</style>
</head>
<body>
<header>
  <h1>Site Audit Report</h1>
  <p class="meta"><strong>{site}</strong> · Generated {generated or "—"} · Exported {exported_at}</p>
</header>
<section>
  <h2>Summary</h2>
  <table><tbody>{summary_html}</tbody></table>
</section>
{rec_html}
<section>
  <h2>Issues</h2>
  {truncated_note}
  <table>
    <thead><tr><th>Category</th><th>Priority</th><th>Issue</th><th>URL</th><th>Recommendation</th></tr></thead>
    <tbody>{issue_rows or "<tr><td colspan=\"5\">No issues recorded.</td></tr>"}</tbody>
  </table>
</section>
<section>
  <h2>URLs (sample)</h2>
  <table>
    <thead><tr><th>URL</th><th>Status</th><th>Title</th><th>Inlinks</th><th>Words</th></tr></thead>
    <tbody>{link_rows or "<tr><td colspan=\"5\">No URLs.</td></tr>"}</tbody>
  </table>
</section>
<section>
  <h2>Data source glossary</h2>
  <table><tbody>{glossary}</tbody></table>
</section>
</body>
</html>"""


def export_audit_pdf(report_id: Optional[int] = None) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise RuntimeError(
            "PDF export requires reportlab (pip install reportlab)"
        ) from exc

    payload = _load_payload(report_id)
    site = str(payload.get("site_name") or "Site Audit")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AuditTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=6,
    )
    story: list[Any] = []
    story.append(Paragraph(f"Site Audit — {html.escape(site)}", title_style))
    meta_line = str(payload.get("report_generated_at") or "")
    if meta_line:
        story.append(Paragraph(f"Generated: {html.escape(meta_line)}", styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))

    summary_data = [["Field", "Value"]] + [[k, v] for k, v in _summary_lines(payload)]
    summary_table = Table(summary_data, colWidths=[2.2 * inch, 4.3 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Summary", styles["Heading2"]))
    story.append(summary_table)
    story.append(Spacer(1, 0.25 * inch))

    issues = sorted(_issues_rows(payload), key=_priority_sort_key)[:_ISSUE_LIMIT_PDF]
    issue_data = [["Category", "Priority", "Issue", "URL"]]
    for row in issues:
        msg = row["message"]
        if len(msg) > 120:
            msg = msg[:117] + "..."
        url = row["url"]
        if len(url) > 80:
            url = url[:77] + "..."
        issue_data.append([row["category"], row["priority"], msg, url])
    if len(issue_data) == 1:
        issue_data.append(["—", "—", "No issues", "—"])
    issue_table = Table(issue_data, colWidths=[1.3 * inch, 0.75 * inch, 2.5 * inch, 2.0 * inch])
    issue_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Issues", styles["Heading2"]))
    total_issues = len(_issues_rows(payload))
    if total_issues > len(issues):
        story.append(Paragraph(
            f"Showing {len(issues)} of {total_issues} issues. Export CSV/JSON for full data.",
            styles["Italic"],
        ))
    story.append(issue_table)
    story.append(Spacer(1, 0.25 * inch))

    gloss_data = [["Source", "Meaning"]] + list(_GLOSSARY_ROWS)
    gloss_table = Table(gloss_data, colWidths=[1.4 * inch, 5.1 * inch])
    gloss_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Data source glossary", styles["Heading2"]))
    story.append(gloss_table)

    doc.build(story)
    return buf.getvalue()
