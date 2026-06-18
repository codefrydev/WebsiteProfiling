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
    from ..reporting.pdf.render.html import html_styles
    return html_styles()
