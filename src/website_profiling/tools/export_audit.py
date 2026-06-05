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
            render_mode = scope.get("render_mode")
            if render_mode == "javascript":
                js_c = scope.get("js_concurrency")
                scope_txt += " — JavaScript rendering"
                if js_c:
                    scope_txt += f" ({js_c} parallel pages)"
            elif render_mode == "auto":
                scope_txt += " — auto rendering (static + JS fallback)"
                ps = scope.get("pages_static")
                pr = scope.get("pages_rendered")
                if ps is not None and pr is not None:
                    scope_txt += f" ({ps} static, {pr} JavaScript-rendered)"
            elif scope.get("static_html_only"):
                scope_txt += " — static HTML only"
            lines.append(("Crawl scope", scope_txt))
            browser_diag = scope.get("browser_diagnostics")
            if isinstance(browser_diag, dict):
                pce = browser_diag.get("pages_with_console_errors")
                tce = browser_diag.get("total_console_errors")
                ppe = browser_diag.get("pages_with_page_errors")
                if pce or ppe:
                    parts = []
                    if pce:
                        parts.append(f"{pce} page(s) with console errors ({tce or 0} total)")
                    if ppe:
                        parts.append(f"{ppe} page(s) with uncaught JS errors")
                    lines.append(("Browser diagnostics", "; ".join(parts)))
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


def _format_report_date(value: str) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    except ValueError:
        return value


def _overall_score(payload: dict[str, Any]) -> Optional[int]:
    scores: list[float] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        raw = cat.get("score")
        if raw is None:
            continue
        try:
            scores.append(float(raw))
        except (TypeError, ValueError):
            continue
    if not scores:
        return None
    return int(round(sum(scores) / len(scores)))


def _score_band(score: Optional[float]) -> tuple[str, str]:
    if score is None:
        return "—", "score-na"
    rounded = int(round(score))
    if rounded >= 80:
        return str(rounded), "score-good"
    if rounded >= 60:
        return str(rounded), "score-fair"
    return str(rounded), "score-poor"


def _issue_priority_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for row in rows:
        key = row["priority"].lower()
        if key in counts:
            counts[key] += 1
    return counts


def _category_cards_html(categories: Any) -> str:
    cards: list[str] = []
    for cat in categories or []:
        if not isinstance(cat, dict):
            continue
        name = html.escape(category_display_name(str(cat.get("name") or "Category")))
        score_txt, score_cls = _score_band(
            float(cat["score"]) if cat.get("score") is not None else None
        )
        issue_n = len(cat.get("issues") or [])
        cards.append(
            f'<article class="score-card {score_cls}">'
            f'<div class="score-value">{score_txt}</div>'
            f'<div class="score-name">{name}</div>'
            f'<div class="score-meta">{issue_n} issue{"s" if issue_n != 1 else ""}</div>'
            f"</article>"
        )
    return "".join(cards) or '<p class="muted">No category scores available.</p>'


def _priority_stats_html(counts: dict[str, int]) -> str:
    labels = (
        ("critical", "Critical"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
    )
    parts: list[str] = []
    for key, label in labels:
        n = counts.get(key, 0)
        parts.append(
            f'<div class="stat stat-{key}">'
            f'<span class="stat-value">{n}</span>'
            f'<span class="stat-label">{label}</span>'
            f"</div>"
        )
    return "".join(parts)


def _report_html_styles() -> str:
    return """
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --surface: #ffffff;
    --surface-muted: #f8fafc;
    --brand: #0b0f19;
    --brand-accent: #2563eb;
    --good: #059669;
    --good-bg: #ecfdf5;
    --fair: #d97706;
    --fair-bg: #fffbeb;
    --poor: #dc2626;
    --poor-bg: #fef2f2;
    --critical: #991b1b;
    --high: #c2410c;
    --medium: #a16207;
    --low: #475569;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eef2f7;
    color: var(--ink);
    font: 400 15px/1.55 "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  .report { max-width: 920px; margin: 0 auto; background: var(--surface); }
  .cover {
    background: linear-gradient(135deg, #0b0f19 0%, #111827 55%, #1e3a5f 100%);
    color: #f8fafc;
    padding: 2.5rem 2.75rem 2rem;
  }
  .cover-brand {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #93c5fd;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  .cover h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.1rem);
    font-weight: 700;
    line-height: 1.15;
  }
  .cover-subtitle {
    margin: 0.5rem 0 0;
    color: #cbd5e1;
    font-size: 1rem;
  }
  .cover-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem 1.5rem;
    margin-top: 1.75rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(255,255,255,0.12);
    font-size: 0.82rem;
  }
  .cover-meta dt { color: #94a3b8; margin: 0 0 0.15rem; font-weight: 500; }
  .cover-meta dd { margin: 0; color: #f1f5f9; font-weight: 600; }
  .content { padding: 2rem 2.75rem 2.5rem; }
  .hero-score {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem 2rem;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface-muted);
    margin-bottom: 1.75rem;
  }
  .hero-score-ring {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1.65rem;
    font-weight: 800;
    border: 4px solid currentColor;
    flex-shrink: 0;
  }
  .hero-score-ring.score-good { color: var(--good); background: var(--good-bg); }
  .hero-score-ring.score-fair { color: var(--fair); background: var(--fair-bg); }
  .hero-score-ring.score-poor { color: var(--poor); background: var(--poor-bg); }
  .hero-score-ring.score-na { color: var(--muted); background: #f1f5f9; border-color: #cbd5e1; }
  .hero-score-copy h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }
  .hero-score-copy p { margin: 0; color: var(--muted); font-size: 0.92rem; }
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.75rem;
  }
  .stat {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.85rem 0.75rem;
    text-align: center;
    background: var(--surface);
  }
  .stat-value { display: block; font-size: 1.35rem; font-weight: 800; line-height: 1.1; }
  .stat-label {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .stat-critical .stat-value { color: var(--critical); }
  .stat-high .stat-value { color: var(--high); }
  .stat-medium .stat-value { color: var(--medium); }
  .stat-low .stat-value { color: var(--low); }
  .score-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.75rem;
  }
  .score-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.9rem 0.75rem;
    background: var(--surface);
  }
  .score-card .score-value { font-size: 1.5rem; font-weight: 800; line-height: 1; }
  .score-card .score-name { margin-top: 0.45rem; font-size: 0.78rem; font-weight: 600; line-height: 1.25; }
  .score-card .score-meta { margin-top: 0.25rem; font-size: 0.72rem; color: var(--muted); }
  .score-card.score-good .score-value { color: var(--good); }
  .score-card.score-fair .score-value { color: var(--fair); }
  .score-card.score-poor .score-value { color: var(--poor); }
  .score-card.score-na .score-value { color: var(--muted); }
  section { margin-bottom: 2rem; page-break-inside: avoid; }
  section h2 {
    margin: 0 0 0.85rem;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
    padding-bottom: 0.45rem;
    border-bottom: 2px solid var(--brand);
  }
  .callout {
    border-left: 4px solid var(--brand-accent);
    background: #eff6ff;
    padding: 1rem 1.15rem;
    border-radius: 0 10px 10px 0;
    margin-bottom: 0.5rem;
  }
  .callout ul { margin: 0; padding-left: 1.15rem; }
  .callout li { margin: 0.35rem 0; }
  table.data {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  table.data th,
  table.data td {
    padding: 0.55rem 0.65rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--line);
  }
  table.data th {
    background: var(--surface-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 700;
  }
  table.data tbody tr:last-child td { border-bottom: none; }
  table.data tbody tr:nth-child(even) td { background: #fcfdff; }
  table.kv th {
    width: 34%;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface-muted);
  }
  .url { word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-critical { background: #fee2e2; color: var(--critical); }
  .badge-high { background: #ffedd5; color: var(--high); }
  .badge-medium { background: #fef3c7; color: var(--medium); }
  .badge-low { background: #f1f5f9; color: var(--low); }
  .muted { color: var(--muted); font-size: 0.86rem; margin: 0.35rem 0 0.75rem; }
  .report-footer {
    border-top: 1px solid var(--line);
    padding: 1.25rem 2.75rem 2rem;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.5;
  }
  @media print {
    body { background: #fff; }
    .report { max-width: none; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .content { padding: 1.2cm 1.4cm; }
    section { page-break-inside: auto; }
    table.data { page-break-inside: auto; }
    table.data tr { page-break-inside: avoid; }
    .report-footer { padding-left: 1.4cm; padding-right: 1.4cm; }
  }
  @media (max-width: 640px) {
    .cover, .content, .report-footer { padding-left: 1.25rem; padding-right: 1.25rem; }
    .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
"""


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
        link_rows += (
            "<tr>"
            f"<td class=\"url\">{html.escape(str(link.get('url') or ''))}</td>"
            f"<td><span class=\"badge {status_cls}\">{html.escape(status or '—')}</span></td>"
            f"<td>{html.escape(str(link.get('title') or ''))}</td>"
            f"<td>{html.escape(str(link.get('inlinks') or ''))}</td>"
            f"<td>{html.escape(str(link.get('word_count') or ''))}</td>"
            "</tr>"
        )

    glossary = "".join(
        f"<tr><th>{html.escape(term)}</th><td>{html.escape(desc)}</td></tr>"
        for term, desc in _GLOSSARY_ROWS
    )

    recs = payload.get("recommendations") or []
    rec_html = ""
    if isinstance(recs, list) and recs:
        items = "".join(f"<li>{html.escape(str(r))}</li>" for r in recs[:12])
        rec_html = (
            '<section><h2>Executive summary</h2>'
            f'<div class="callout"><ul>{items}</ul></div></section>'
        )

    truncated_note = ""
    if issue_total > len(issues):
        truncated_note = (
            f'<p class="muted">Showing {len(issues)} of {issue_total} issues. '
            "Download CSV or JSON for the complete audit dataset.</p>"
        )

    exported_at = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    report_title = html.escape(str(payload.get("report_title") or "Technical SEO Audit Report"))
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
        <thead><tr><th>URL</th><th>Status</th><th>Title</th><th>Inlinks</th><th>Words</th></tr></thead>
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
            score_txt = str(int(round(float(score)))) if score is not None else "—"
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

    recs = payload.get("recommendations") or []
    if isinstance(recs, list) and recs:
        rec_items = "".join(f"• {html.escape(str(r))}<br/>" for r in recs[:8])
        story.append(Paragraph("Executive summary", section_style))
        story.append(Paragraph(rec_items, styles["Normal"]))
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
