"""Export audit payload to CSV, JSON, HTML (preview/print), and PDF."""
from __future__ import annotations

import csv
import html
import io
import json
from datetime import datetime, timezone
from typing import Optional

from ..db import db_session, read_report_payload
from ..reporting.terminology import category_display_name
from .export_audit_data import (
    _GLOSSARY_ROWS,
    _ISSUE_LIMIT_HTML,
    _ISSUE_LIMIT_PDF,
    _LINK_LIMIT,
    _executive_export_data,
    _executive_source_label,
    _format_report_date,
    _issue_priority_counts,
    _issue_recommendation,
    _issues_rows,
    _overall_score,
    _priority_sort_key,
    _score_band,
    _summary_lines,
)
from .export_audit_html import (
    _category_cards_html,
    _executive_summary_html,
    _priority_stats_html,
    _report_html_styles,
)


def _load_payload(report_id: Optional[int] = None) -> dict:
    """Load report payload from DB (uses module-level db_session for test patches)."""
    with db_session() as conn:
        payload = read_report_payload(conn, report_id)
    if not payload:
        raise FileNotFoundError("No report payload found")
    return payload


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
    exec_data = _executive_export_data(payload)
    if exec_data["summary"] or exec_data["priorities"]:
        w.writerow([])
        w.writerow(["# Executive summary"])
        w.writerow(["source", _executive_source_label(exec_data["source"])])
        if exec_data["summary"]:
            w.writerow(["summary", exec_data["summary"]])
        for i, pri in enumerate(exec_data["priorities"], 1):
            w.writerow([f"priority_{i}", pri])
    w.writerow([])
    w.writerow(["category", "priority", "message", "url", "recommendation", "llm_recommendation"])
    for row in _issues_rows(payload):
        w.writerow([
            row["category"],
            row["priority"],
            row["message"],
            row["url"],
            row["recommendation"],
            row.get("llm_recommendation", ""),
        ])
    return buf.getvalue()


def export_audit_json(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    return json.dumps(payload, indent=2, default=str)


def export_audit_html(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    site_raw = str(payload.get("site_name") or "Site Audit")
    site = html.escape(site_raw)
    generated_raw = str(payload.get("report_generated_at") or "")
    generated = html.escape(_format_report_date(generated_raw))
    all_issues = _issues_rows(payload)
    issues = sorted(all_issues, key=_priority_sort_key)[:_ISSUE_LIMIT_HTML]
    issue_total = len(all_issues)
    priority_counts = _issue_priority_counts(all_issues)
    links = [l for l in (payload.get("links") or []) if isinstance(l, dict)][:_LINK_LIMIT]
    categories = payload.get("categories") or []
    overall = _overall_score(payload)
    overall_txt, overall_cls = _score_band(float(overall) if overall is not None else None)

    summary_html = "".join(
        f"<tr><th>{html.escape(k)}</th><td>{html.escape(v)}</td></tr>"
        for k, v in _summary_lines(payload)
    )

    issue_rows = ""
    for row in issues:
        pri = row["priority"].lower()
        badge_cls = f"badge-{pri}" if pri in {"critical", "high", "medium", "low"} else "badge-low"
        issue_rows += (
            "<tr>"
            f"<td>{html.escape(row['category'])}</td>"
            f"<td><span class=\"badge {badge_cls}\">{html.escape(row['priority'])}</span></td>"
            f"<td>{html.escape(row['message'])}</td>"
            f"<td class=\"url\">{html.escape(row['url'])}</td>"
            f"<td>{html.escape(row['recommendation'])}</td>"
            "</tr>"
        )

    has_custom_extract = any(isinstance(l, dict) and l.get("custom_extract") for l in links)
    link_rows = ""
    for link in links:
        status = str(link.get("status") or "")
        status_cls = "badge-low"
        if status.startswith("2"):
            status_cls = "badge-medium"
        elif status.startswith("3"):
            status_cls = "badge-high"
        elif status.startswith("4") or status.startswith("5"):
            status_cls = "badge-critical"
        custom_cell = (
            f"<td>{html.escape(str(link.get('custom_extract') or ''))}</td>"
            if has_custom_extract
            else ""
        )
        link_rows += (
            "<tr>"
            f"<td class=\"url\">{html.escape(str(link.get('url') or ''))}</td>"
            f"<td><span class=\"badge {status_cls}\">{html.escape(status or '—')}</span></td>"
            f"<td>{html.escape(str(link.get('title') or ''))}</td>"
            f"<td>{html.escape(str(link.get('inlinks') or ''))}</td>"
            f"<td>{html.escape(str(link.get('word_count') or ''))}</td>"
            f"{custom_cell}"
            "</tr>"
        )

    glossary = "".join(
        f"<tr><th>{html.escape(term)}</th><td>{html.escape(desc)}</td></tr>"
        for term, desc in _GLOSSARY_ROWS
    )

    rec_html = _executive_summary_html(payload)

    truncated_note = ""
    if issue_total > len(issues):
        truncated_note = (
            f'<p class="muted">Showing {len(issues)} of {issue_total} issues. '
            "Download CSV or JSON for the complete audit dataset.</p>"
        )

    exported_at = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    report_title = html.escape(str(payload.get("report_title") or "Technical SEO Audit Report"))
    report_meta = payload.get("report_meta") if isinstance(payload.get("report_meta"), dict) else {}
    logo_url = str(report_meta.get("export_logo_url") or "").strip()
    logo_html = (
        f'<img src="{html.escape(logo_url)}" alt="Logo" class="export-logo" style="max-height:48px;margin-bottom:12px"/>'
        if logo_url
        else ""
    )
    hero_copy = (
        f"{issue_total} findings across {len(categories)} audit categories."
        if categories
        else f"{issue_total} findings recorded in this audit."
    )
    if overall is not None:
        hero_copy = f"Overall health score {overall}/100. {hero_copy}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Site Audit — {site}</title>
<style>{_report_html_styles()}</style>
</head>
<body>
<div class="report">
  <header class="cover">
    <div class="cover-brand">Site Audit</div>
    {logo_html}
    <h1>{site}</h1>
    <p class="cover-subtitle">{report_title}</p>
    <dl class="cover-meta">
      <div><dt>Report generated</dt><dd>{generated}</dd></div>
      <div><dt>Exported</dt><dd>{html.escape(exported_at)}</dd></div>
      <div><dt>Total findings</dt><dd>{issue_total}</dd></div>
    </dl>
  </header>

  <main class="content">
    <div class="hero-score">
      <div class="hero-score-ring {overall_cls}">{overall_txt}</div>
      <div class="hero-score-copy">
        <h2>Audit health overview</h2>
        <p>{html.escape(hero_copy)}</p>
      </div>
    </div>

    <div class="stats-row">{_priority_stats_html(priority_counts)}</div>

    <section>
      <h2>Category scores</h2>
      <div class="score-grid">{_category_cards_html(categories)}</div>
    </section>

    {rec_html}

    <section>
      <h2>Audit details</h2>
      <table class="data kv"><tbody>{summary_html}</tbody></table>
    </section>

    <section>
      <h2>Findings</h2>
      {truncated_note}
      <table class="data">
        <thead><tr>
          <th>Category</th><th>Priority</th><th>Issue</th><th>URL</th><th>Recommendation</th>
        </tr></thead>
        <tbody>{issue_rows or '<tr><td colspan="5">No issues recorded.</td></tr>'}</tbody>
      </table>
    </section>

    <section>
      <h2>Crawled URLs (sample)</h2>
      <p class="muted">First {len(links)} URLs from the crawl. Export CSV for the full URL inventory.</p>
      <table class="data">
        <thead><tr><th>URL</th><th>Status</th><th>Title</th><th>Inlinks</th><th>Words</th>{'<th>Custom extract</th>' if has_custom_extract else ''}</tr></thead>
        <tbody>{link_rows or '<tr><td colspan="5">No URLs recorded.</td></tr>'}</tbody>
      </table>
    </section>

    <section>
      <h2>Data source glossary</h2>
      <table class="data kv"><tbody>{glossary}</tbody></table>
    </section>
  </main>

  <footer class="report-footer">
    Confidential — prepared for client review. Verify AI-generated insights before delivery.
    Generated by Site Audit · {html.escape(exported_at)}
  </footer>
</div>
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
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.55 * inch, bottomMargin=0.55 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AuditTitle",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "AuditSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=colors.HexColor("#0b0f19"),
        spaceBefore=8,
        spaceAfter=6,
    )
    table_header = colors.HexColor("#f1f5f9")
    table_grid = colors.HexColor("#e2e8f0")

    story: list[Any] = []
    story.append(Paragraph(f"Site Audit — {html.escape(site)}", title_style))
    meta_line = _format_report_date(str(payload.get("report_generated_at") or ""))
    story.append(Paragraph(
        f"Technical SEO Audit Report · Generated {html.escape(meta_line)}",
        subtitle_style,
    ))

    overall = _overall_score(payload)
    all_issues = _issue_priority_counts(_issues_rows(payload))
    if overall is not None:
        story.append(Paragraph(
            f"<b>Overall health score:</b> {overall}/100 · "
            f"Findings: {sum(all_issues.values())} "
            f"(Critical {all_issues['critical']}, High {all_issues['high']}, "
            f"Medium {all_issues['medium']}, Low {all_issues['low']})",
            styles["Normal"],
        ))
        story.append(Spacer(1, 0.15 * inch))

    categories = payload.get("categories") or []
    if categories:
        cat_data = [["Category", "Score", "Issues"]]
        for cat in categories:
            if not isinstance(cat, dict):
                continue
            name = category_display_name(str(cat.get("name") or "Category"))
            score = cat.get("score")
            score_txt = "—"
            if score is not None:
                try:
                    score_txt = str(int(round(float(score))))
                except (TypeError, ValueError):
                    score_txt = "—"
            cat_data.append([name, score_txt, str(len(cat.get("issues") or []))])
        cat_table = Table(cat_data, colWidths=[3.0 * inch, 0.9 * inch, 0.9 * inch])
        cat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), table_header),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.25, table_grid),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ]))
        story.append(Paragraph("Category scores", section_style))
        story.append(cat_table)
        story.append(Spacer(1, 0.2 * inch))

    exec_data = _executive_export_data(payload)
    if exec_data["summary"] or exec_data["priorities"] or exec_data["top_issues"]:
        story.append(Paragraph("Executive summary", section_style))
        if exec_data["source"]:
            story.append(Paragraph(
                f"<i>Source: {html.escape(_executive_source_label(exec_data['source']))}</i>",
                styles["Normal"],
            ))
        if exec_data["summary"]:
            summary_pdf = html.escape(exec_data["summary"]).replace("\n", "<br/>")
            story.append(Paragraph(summary_pdf, styles["Normal"]))
        if exec_data["priorities"]:
            pri_items = "".join(f"• {html.escape(p)}<br/>" for p in exec_data["priorities"][:8])
            story.append(Paragraph(f"<b>Priorities</b><br/>{pri_items}", styles["Normal"]))
        if exec_data["top_issues"]:
            top_data = [["Priority", "Issue", "URL"]]
            for iss in exec_data["top_issues"][:6]:
                msg = str(iss.get("message") or "")
                if len(msg) > 100:
                    msg = msg[:97] + "..."
                url = str(iss.get("url") or "")
                if len(url) > 70:
                    url = url[:67] + "..."
                top_data.append([str(iss.get("priority") or ""), msg, url])
            top_table = Table(top_data, colWidths=[0.85 * inch, 3.2 * inch, 2.45 * inch])
            top_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), table_header),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, table_grid),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(Paragraph("<b>Top traffic-impacting issues</b>", styles["Normal"]))
            story.append(top_table)
        story.append(Spacer(1, 0.2 * inch))

    summary_data = [["Field", "Value"]] + [[k, v] for k, v in _summary_lines(payload)]
    summary_table = Table(summary_data, colWidths=[2.2 * inch, 4.3 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), table_header),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, table_grid),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Audit details", section_style))
    story.append(summary_table)
    story.append(Spacer(1, 0.2 * inch))

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
        ("BACKGROUND", (0, 0), (-1, 0), table_header),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, table_grid),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Findings", section_style))
    total_issues = len(_issues_rows(payload))
    if total_issues > len(issues):
        story.append(Paragraph(
            f"Showing {len(issues)} of {total_issues} issues. Export CSV/JSON for full data.",
            styles["Italic"],
        ))
    story.append(issue_table)
    story.append(Spacer(1, 0.2 * inch))

    gloss_data = [["Source", "Meaning"]] + list(_GLOSSARY_ROWS)
    gloss_table = Table(gloss_data, colWidths=[1.4 * inch, 5.1 * inch])
    gloss_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), table_header),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, table_grid),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(Paragraph("Data source glossary", section_style))
    story.append(gloss_table)

    exported_at = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(
        f"Confidential — prepared for client review. Generated by Site Audit · {html.escape(exported_at)}",
        ParagraphStyle(
            "Footer",
            parent=styles["Normal"],
            fontSize=7,
            textColor=colors.HexColor("#64748b"),
        ),
    ))

    doc.build(story)
    return buf.getvalue()
