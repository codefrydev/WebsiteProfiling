"""Audit export HTML generation."""
from __future__ import annotations

import html
from typing import Any, Optional

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
    _issues_rows,
    _overall_score,
    _priority_sort_key,
    _score_band,
    _summary_lines,
)

def _executive_summary_html(payload: dict[str, Any]) -> str:
    data = _executive_export_data(payload)
    if not data["summary"] and not data["priorities"] and not data["top_issues"]:
        return ""

    parts: list[str] = ['<section><h2>Executive summary</h2>']
    if data["source"]:
        parts.append(
            f'<p class="muted">Source: {html.escape(_executive_source_label(data["source"]))}</p>'
        )
    if data["summary"]:
        summary_html = html.escape(data["summary"]).replace("\n", "<br/>")
        parts.append(f'<div class="callout"><p>{summary_html}</p></div>')

    if data["priorities"]:
        pri_items = "".join(f"<li>{html.escape(p)}</li>" for p in data["priorities"][:8])
        parts.append(f"<h3>Priorities</h3><ul>{pri_items}</ul>")

    if data["top_issues"]:
        rows = ""
        for iss in data["top_issues"]:
            pri = str(iss.get("priority") or "").lower()
            badge_cls = f"badge-{pri}" if pri in {"critical", "high", "medium", "low"} else "badge-low"
            clicks = iss.get("gsc_clicks")
            clicks_txt = ""
            if clicks is not None:
                try:
                    if float(clicks) > 0:
                        clicks_txt = f' · {int(float(clicks))} GSC clicks'
                except (TypeError, ValueError):
                    pass
            rows += (
                "<tr>"
                f"<td><span class=\"badge {badge_cls}\">{html.escape(str(iss.get('priority') or ''))}</span></td>"
                f"<td>{html.escape(str(iss.get('message') or ''))}</td>"
                f"<td class=\"url\">{html.escape(str(iss.get('url') or ''))}</td>"
                f"<td>{html.escape(clicks_txt.lstrip(' · ') if clicks_txt else '—')}</td>"
                "</tr>"
            )
        parts.append(
            "<h3>Top traffic-impacting issues</h3>"
            '<table class="data"><thead><tr>'
            "<th>Priority</th><th>Issue</th><th>URL</th><th>GSC clicks</th>"
            f"</tr></thead><tbody>{rows}</tbody></table>"
        )

    parts.append("</section>")
    return "".join(parts)


def _category_cards_html(categories: Any) -> str:
    cards: list[str] = []
    for cat in categories or []:
        if not isinstance(cat, dict):
            continue
        name = html.escape(category_display_name(str(cat.get("name") or "Category")))
        score_val: float | None = None
        if cat.get("score") is not None:
            try:
                score_val = float(cat["score"])
            except (TypeError, ValueError):
                score_val = None
        score_txt, score_cls = _score_band(score_val)
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
