"""HTML renderer — converts PdfDocument → preview/print HTML matching the PDF layout."""
from __future__ import annotations

import html
import re
from typing import Any

from ..document import (
    CalloutBlock,
    HeadingBlock,
    IssueGroupBlock,
    IssueTableBlock,
    KeyValueBlock,
    KpiRowBlock,
    MarkdownBlock,
    MetricTableBlock,
    ParagraphBlock,
    PdfCoverBlock,
    PdfDocument,
    PdfIssue,
    PdfSection,
    ScoreCardsBlock,
    SpacerBlock,
    StatGridBlock,
    UrlListBlock,
)
from . import styles as S


def html_styles() -> str:
    """CSS shared by standard export preview HTML."""
    return """
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --surface: #ffffff;
    --surface-muted: #f8fafc;
    --header-bg: #f1f5f9;
    --brand-accent: #2563eb;
    --good: #059669;
    --good-bg: #ecfdf5;
    --fair: #d97706;
    --fair-bg: #fffbeb;
    --poor: #dc2626;
    --poor-bg: #fef2f2;
    --critical-fg: #991b1b;
    --critical-bg: #fee2e2;
    --high-fg: #c2410c;
    --high-bg: #ffedd5;
    --medium-fg: #a16207;
    --medium-bg: #fef3c7;
    --low-fg: #475569;
    --low-bg: #f1f5f9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eef2f7;
    color: var(--ink);
    font: 400 14px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  .report {
    max-width: 816px;
    margin: 0 auto;
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }
  .cover {
    padding: 1.75rem 1.85rem 1.25rem;
    background: var(--surface);
  }
  .cover-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.35rem;
  }
  .cover-head h1 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .cover-subtitle {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .hero-score {
    text-align: center;
    min-width: 4.5rem;
  }
  .hero-score .score {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }
  .hero-score .suffix {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .hero-score.score-good .score { color: var(--good); }
  .hero-score.score-fair .score { color: var(--fair); }
  .hero-score.score-poor .score { color: var(--poor); }
  .hero-score.score-na .score { color: var(--muted); }
  .cover-meta-line {
    margin: 0.5rem 0 1rem;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .section-title {
    margin: 1.1rem 0 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--ink);
  }
  .section-rule {
    border: none;
    border-top: 1px solid var(--line);
    margin: 0 0 0.65rem;
  }
  .section-lead {
    margin: 0 0 0.65rem;
    color: var(--muted);
    font-size: 0.78rem;
  }
  .grid-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 0.85rem;
    font-size: 0.82rem;
  }
  .grid-table th,
  .grid-table td {
    border: 1px solid var(--line);
    padding: 0.65rem 0.5rem;
    text-align: center;
    vertical-align: middle;
  }
  .stat-grid td.stat-critical { background: var(--critical-bg); color: var(--critical-fg); }
  .stat-grid td.stat-high { background: var(--high-bg); color: var(--high-fg); }
  .stat-grid td.stat-medium { background: var(--medium-bg); color: var(--medium-fg); }
  .stat-grid td.stat-low { background: var(--low-bg); color: var(--low-fg); }
  .stat-grid .stat-value {
    display: block;
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .stat-grid .stat-label {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .score-grid .score-value {
    display: block;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .score-grid .score-name {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.25;
  }
  .score-grid .score-meta {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.68rem;
    color: var(--muted);
  }
  .score-grid td { background: var(--surface-muted); }
  .score-grid .score-good .score-value { color: var(--good); }
  .score-grid .score-fair .score-value { color: var(--fair); }
  .score-grid .score-poor .score-value { color: var(--poor); }
  .score-grid .score-na .score-value { color: var(--muted); }
  .exec-panel {
    border: 1px solid var(--line);
    border-left: 3px solid var(--brand-accent);
    background: var(--surface-muted);
    padding: 0.85rem 1rem;
    margin-bottom: 1rem;
    border-radius: 0 4px 4px 0;
  }
  .exec-source {
    margin: 0 0 0.45rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--brand-accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .exec-body { margin: 0; font-size: 0.88rem; line-height: 1.5; }
  .exec-subhead {
    margin: 0.65rem 0 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .exec-priorities {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    border: 1px solid var(--line);
    margin-bottom: 0.85rem;
  }
  .data-table th,
  .data-table td {
    padding: 0.55rem 0.65rem;
    text-align: left;
    vertical-align: middle;
    border-bottom: 1px solid var(--line);
  }
  .data-table thead th {
    background: var(--header-bg);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .data-table tbody tr:nth-child(even) td { background: var(--surface-muted); }
  .data-table tbody tr:last-child td { border-bottom: none; }
  .data-table .col-status { text-align: center; width: 4.5rem; }
  .data-table .col-priority { text-align: center; width: 5rem; }
  .kv-audit th {
    width: 23%;
    font-weight: 700;
    vertical-align: top;
  }
  .kv-glossary th {
    width: 21%;
    font-weight: 700;
    vertical-align: top;
    background: var(--header-bg);
  }
  .kv-glossary td { line-height: 1.45; }
  .link { color: var(--brand-accent); word-break: break-all; }
  .site-wide { color: var(--muted); font-style: italic; font-size: 0.78rem; }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.45rem;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 1px solid transparent;
  }
  .badge-critical { background: var(--critical-bg); color: var(--critical-fg); border-color: var(--critical-fg); }
  .badge-high { background: var(--high-bg); color: var(--high-fg); border-color: var(--high-fg); }
  .badge-medium { background: var(--medium-bg); color: var(--medium-fg); border-color: var(--medium-fg); }
  .badge-low { background: var(--low-bg); color: var(--low-fg); border-color: var(--low-fg); }
  .status-200 { background: var(--good-bg); color: var(--good); border-color: var(--good); }
  .status-3xx { background: var(--fair-bg); color: var(--fair); border-color: var(--fair); }
  .status-4xx, .status-5xx { background: var(--poor-bg); color: var(--poor); border-color: var(--poor); }
  .status-other { background: var(--surface-muted); color: var(--muted); border-color: var(--line); }
  .content { padding: 0 1.85rem 1.5rem; }
  .doc-section { margin-bottom: 1.35rem; }
  .doc-section > h2 {
    margin: 0 0 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
  }
  .doc-section .source-label {
    margin: 0 0 0.5rem;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .group-label {
    margin: 0.65rem 0 0.35rem;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .issue-card {
    border-left: 3px solid var(--line);
    background: var(--surface-muted);
    padding: 0.45rem 0.65rem;
    margin-bottom: 0.45rem;
    font-size: 0.82rem;
  }
  .issue-card.priority-critical { border-color: var(--critical-fg); background: var(--critical-bg); }
  .issue-card.priority-high { border-color: var(--high-fg); background: var(--high-bg); }
  .issue-card.priority-medium { border-color: var(--medium-fg); background: var(--medium-bg); }
  .issue-card.priority-low { border-color: var(--low-fg); background: var(--low-bg); }
  .issue-headline { margin: 0; font-weight: 700; line-height: 1.35; }
  .issue-url {
    margin: 0.2rem 0 0;
    font-size: 0.76rem;
    color: var(--brand-accent);
    word-break: break-all;
  }
  .issue-rec {
    margin: 0.25rem 0 0;
    font-size: 0.76rem;
    color: var(--muted);
    font-style: italic;
  }
  .issue-url-list {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
    font-size: 0.76rem;
    color: var(--brand-accent);
  }
  .muted-note {
    margin: 0.35rem 0 0;
    font-size: 0.76rem;
    color: var(--muted);
  }
  .page-break {
    break-before: page;
    page-break-before: always;
    height: 0;
    margin: 0;
    border-top: 1px dashed var(--line);
  }
  .report-footer {
    border-top: 1px solid var(--line);
    padding: 0.85rem 1.85rem 1.25rem;
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.45;
  }
  .content {
    padding: 0 1.85rem 1.5rem;
  }
  .custom-section {
    margin-bottom: 1.35rem;
  }
  .custom-section > h2 {
    margin: 0 0 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
  }
  .callout {
    border: 1px solid var(--line);
    border-left: 3px solid var(--brand-accent);
    background: var(--surface-muted);
    padding: 0.85rem 1rem;
    border-radius: 0 4px 4px 0;
    margin: 0.5rem 0;
  }
  p.muted, .muted {
    color: var(--muted);
    font-size: 0.82rem;
    margin: 0.35rem 0 0.65rem;
  }
  .url, td.url {
    color: var(--brand-accent);
    word-break: break-all;
    font-size: 0.76rem;
  }
  table.data, .table-wrap table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    border: 1px solid var(--line);
    margin: 0.5rem 0 0.85rem;
  }
  table.data th, table.data td,
  .table-wrap table th, .table-wrap table td {
    padding: 0.55rem 0.65rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--line);
  }
  table.data thead th, .table-wrap table thead th {
    background: var(--header-bg);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .category-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0.65rem 0;
  }
  article.score-card {
    flex: 1 1 140px;
    max-width: 180px;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.75rem;
    background: var(--surface-muted);
    text-align: center;
  }
  article.score-card .score-value {
    font-size: 1.1rem;
    font-weight: 700;
  }
  article.score-card .score-name {
    margin-top: 0.35rem;
    font-size: 0.72rem;
    font-weight: 600;
  }
  article.score-card .score-meta {
    margin-top: 0.2rem;
    font-size: 0.68rem;
    color: var(--muted);
  }
  article.score-card.score-good .score-value { color: var(--good); }
  article.score-card.score-fair .score-value { color: var(--fair); }
  article.score-card.score-poor .score-value { color: var(--poor); }
  article.score-card.score-na .score-value { color: var(--muted); }
  .notes, .json-preview {
    line-height: 1.5;
    font-size: 0.82rem;
  }
  .json-preview {
    overflow-x: auto;
    background: var(--surface-muted);
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  @media print {
    body { background: #fff; }
    .report { max-width: none; box-shadow: none; }
    .cover, .content, .report-footer { padding-left: 0.65in; padding-right: 0.65in; }
    .page-break { border: none; }
  }
"""


def _esc(text: Any) -> str:
    return html.escape(str(text) if text is not None else "")


def _priority_badge(priority: str) -> str:
    key = priority.lower()
    cls = f"badge badge-{key}" if key in {"critical", "high", "medium", "low"} else "badge badge-low"
    return f'<span class="{cls}">{_esc(priority)}</span>'


def _status_badge(code: str) -> str:
    c = str(code or "").strip()
    if c == "200":
        cls = "badge status-200"
    elif c.startswith("3"):
        cls = "badge status-3xx"
    elif c and c[0] in "45":
        cls = "badge status-4xx" if c.startswith("4") else "badge status-5xx"
    else:
        cls = "badge status-other"
    return f'<span class="{cls}">{_esc(c or "—")}</span>'


def _issue_location(issue: PdfIssue) -> str:
    if issue.path:
        return f'<span class="link">{_esc(issue.path)}</span>'
    if issue.url:
        return f'<span class="link">{_esc(issue.url)}</span>'
    return '<span class="site-wide">Site-wide</span>'


def _section_heading(title: str) -> str:
    return f'<h3 class="section-title">{_esc(title)}</h3><hr class="section-rule"/>'


def _render_stat_grid(block: StatGridBlock) -> str:
    if not block.chips:
        return ""
    cells = []
    for chip in block.chips:
        tone = chip.tone if chip.tone in {"critical", "high", "medium", "low"} else "low"
        cells.append(
            f'<td class="stat-{tone}">'
            f'<span class="stat-value">{_esc(chip.value)}</span>'
            f'<span class="stat-label">{_esc(chip.label)}</span>'
            f"</td>"
        )
    while len(cells) < block.columns:
        cells.append("<td></td>")
    return f'<table class="grid-table stat-grid"><tr>{"".join(cells)}</tr></table>'


def _render_score_cards(block: ScoreCardsBlock) -> str:
    if not block.cards:
        return ""
    cols = S.GRID_COLS
    rows_html: list[str] = []
    row: list[str] = []
    for card in block.cards:
        issue_label = f"{card.issue_count} issue{'s' if card.issue_count != 1 else ''}"
        row.append(
            f'<td class="{_esc(card.tone)}">'
            f'<span class="score-value">{_esc(card.score or "—")}</span>'
            f'<span class="score-name">{_esc(card.name)}</span>'
            f'<span class="score-meta">{issue_label}</span>'
            f"</td>"
        )
        if len(row) == cols:
            rows_html.append(f"<tr>{''.join(row)}</tr>")
            row = []
    if row:
        while len(row) < cols:
            row.append("<td></td>")
        rows_html.append(f"<tr>{''.join(row)}</tr>")
    return f'<table class="grid-table score-grid">{"".join(rows_html)}</table>'


def _render_executive_panel(cover: PdfCoverBlock) -> str:
    if not (cover.executive_summary or cover.priorities_list):
        return ""
    parts = ['<div class="exec-panel">']
    if cover.executive_source:
        parts.append(f'<p class="exec-source">Source · {_esc(cover.executive_source)}</p>')
    if cover.executive_summary:
        parts.append(f'<p class="exec-body">{_esc(cover.executive_summary)}</p>')
    if cover.priorities_list:
        parts.append('<p class="exec-subhead">Recommended priorities</p>')
        parts.append('<ol class="exec-priorities">')
        for pri in cover.priorities_list[:6]:
            parts.append(f"<li>{_esc(pri)}</li>")
        parts.append("</ol>")
    parts.append("</div>")
    return "".join(parts)


def _render_top_issues(issues: list[PdfIssue]) -> str:
    if not issues:
        return ""
    rows = "".join(
        f"<tr>"
        f'<td class="col-priority">{_priority_badge(iss.priority)}</td>'
        f"<td>{_esc(iss.headline)}</td>"
        f"<td>{_issue_location(iss)}</td>"
        f"</tr>"
        for iss in issues
    )
    return (
        f"{_section_heading('Top traffic-impacting issues')}"
        f'<p class="section-lead">Ranked by severity and traffic impact — address critical and high items first.</p>'
        f'<table class="data-table top-issues">'
        f"<thead><tr><th class=\"col-priority\">Priority</th><th>Issue</th><th>Location</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


def _render_cover(cover: PdfCoverBlock, meta) -> str:
    counts = meta.issue_counts
    total = sum(counts.values())
    meta_line = (
        f"Report generated {meta.generated_at} · {total} findings "
        f"(Critical {counts.get('critical', 0)}, High {counts.get('high', 0)}, "
        f"Medium {counts.get('medium', 0)}, Low {counts.get('low', 0)})"
    )
    hero = cover.hero
    exec_html = ""
    if cover.executive_summary or cover.priorities_list:
        exec_html = _section_heading("Executive summary") + _render_executive_panel(cover)
    top_html = _render_top_issues(cover.top_issues)

    cat_html = ""
    if cover.category_scores.cards:
        cat_html = _section_heading("Category scores") + _render_score_cards(cover.category_scores)

    return f"""
  <header class="cover">
    <div class="cover-head">
      <div>
        <h1>{_esc(cover.headline)}</h1>
        <p class="cover-subtitle">{_esc(cover.subtitle)}</p>
      </div>
      <div class="hero-score {_esc(hero.band)}">
        <span class="score">{_esc(hero.score or "—")}</span>
        <span class="suffix">/100</span>
      </div>
    </div>
    <p class="cover-meta-line">{_esc(meta_line)}</p>
    {_render_stat_grid(cover.priority_strip)}
    {cat_html}
    {exec_html}
    {top_html}
  </header>"""


def _render_issue(issue: PdfIssue) -> str:
    pri = issue.priority.lower()
    cls = f"issue-card priority-{pri}" if pri in {"critical", "high", "medium", "low"} else "issue-card"
    parts = [f'<div class="{cls}">', f'<p class="issue-headline">{_esc(issue.headline)}</p>']
    if issue.related_urls:
        items = "".join(f"<li>{_esc(u)}</li>" for u in issue.related_urls[:10])
        extra = len(issue.related_urls) - 10
        if extra > 0:
            items += f'<li class="muted-note">… and {extra} more (see CSV export)</li>'
        parts.append(f'<ul class="issue-url-list">{items}</ul>')
    elif issue.url:
        parts.append(f'<p class="issue-url">{_esc(issue.url)}</p>')
    if issue.recommendation:
        parts.append(f'<p class="issue-rec">Fix: {_esc(issue.recommendation)}</p>')
    parts.append("</div>")
    return "".join(parts)


def _render_issue_group(block: IssueGroupBlock) -> str:
    parts = [f'<p class="group-label">{_esc(block.group_label)}</p>']
    if block.render_as == "compact_table":
        rows = "".join(
            f"<tr><td>{_esc(iss.headline)}</td>"
            f'<td class="link">{_esc(iss.url or "")}</td></tr>'
            for iss in block.issues
        )
        parts.append(
            f'<table class="data-table"><thead><tr><th>Issue</th><th>URL</th></tr></thead>'
            f"<tbody>{rows}</tbody></table>"
        )
    else:
        for iss in block.issues:
            parts.append(_render_issue(iss))
    if block.truncation:
        t = block.truncation
        parts.append(
            f'<p class="muted-note">Showing {t.shown} of {t.total}. '
            f"Full list in {', '.join(t.continue_in)}.</p>"
        )
    return "".join(parts)


def _render_key_value(block: KeyValueBlock) -> str:
    if not block.rows:
        return ""
    layout = getattr(block, "layout", "default") or "default"
    if layout == "audit":
        table_cls = "data-table kv-audit"
    elif layout == "glossary":
        table_cls = "data-table kv-glossary"
    else:
        table_cls = "data-table kv-audit"
    rows = "".join(
        f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>" for k, v in block.rows
    )
    return f'<table class="{table_cls}"><tbody>{rows}</tbody></table>'


def _render_url_list(block: UrlListBlock) -> str:
    if not block.rows:
        return ""
    show_title = getattr(block, "show_title", True)
    head = "<th>URL</th><th class=\"col-status\">Status</th>"
    if show_title:
        head += "<th>Title</th>"
    body_rows: list[str] = []
    for row in block.rows:
        url = str(row.get("url") or "")
        status = str(row.get("status") or "")
        cells = (
            f'<td class="link">{_esc(url)}</td>'
            f'<td class="col-status">{_status_badge(status)}</td>'
        )
        if show_title:
            title = str(row.get("title") or "").strip()
            title_cell = _esc(title) if title else '<span class="site-wide">—</span>'
            cells += f"<td>{title_cell}</td>"
        body_rows.append(f"<tr>{cells}</tr>")
    note = ""
    if block.truncation:
        t = block.truncation
        note = (
            f'<p class="muted-note">Showing {t.shown} of {t.total} URLs. '
            f"Export CSV/workbook for full inventory.</p>"
        )
    return (
        f'<table class="data-table url-list"><thead><tr>{head}</tr></thead>'
        f'<tbody>{"".join(body_rows)}</tbody></table>{note}'
    )


def _render_block(block: Any) -> str:
    if not getattr(block, "visible", True):
        return ""
    btype = getattr(block, "type", None)
    if btype == "issue_group":
        return _render_issue_group(block)
    if btype == "key_value":
        return _render_key_value(block)
    if btype == "url_list":
        return _render_url_list(block)
    if btype == "issue_table":
        rows = "".join(
            f"<tr><td>{_esc(iss.headline)}</td><td class=\"link\">{_esc(iss.url or '')}</td></tr>"
            for iss in block.issues
        )
        title = f"<p class=\"group-label\">{_esc(block.title)}</p>" if block.title else ""
        return (
            f"{title}<table class=\"data-table\"><thead><tr><th>Issue</th><th>URL</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>"
        )
    if btype == "paragraph":
        return f"<p>{_esc(block.text)}</p>"
    if btype == "heading":
        tag = "h3" if block.level >= 3 else "h2"
        return f"<{tag}>{_esc(block.text)}</{tag}>"
    if btype == "callout":
        return f'<div class="exec-panel"><p class="exec-body">{_esc(block.text)}</p></div>'
    if btype == "markdown":
        text = re.sub(r"<[^>]+>", " ", block.text)
        return f"<p>{_esc(text)}</p>"
    if btype == "metric_table":
        cols = block.columns
        if not cols:
            return ""
        head = "".join(f"<th>{_esc(c.label)}</th>" for c in cols)
        body = ""
        for row in block.rows:
            body += "<tr>" + "".join(
                f'<td>{_esc(row.get(c.key, ""))}</td>' for c in cols
            ) + "</tr>"
        return f'<table class="data-table"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'
    if btype in {"spacer", "kpi_row", "stat_grid", "score_cards"}:
        return ""
    return ""


def _render_section(section: PdfSection) -> str:
    parts = [f'<section class="doc-section" id="{_esc(section.id)}">']
    parts.append(f"<h2>{_esc(section.title)}</h2><hr class=\"section-rule\"/>")
    if section.source_label:
        parts.append(f'<p class="source-label">Source: {_esc(section.source_label)}</p>')
    for block in section.blocks:
        parts.append(_render_block(block))
    if section.truncation:
        t = section.truncation
        parts.append(
            f'<p class="muted-note">Showing {t.shown} of {t.total} issues. '
            f"Export CSV or workbook for full data.</p>"
        )
    parts.append("</section>")
    return "".join(parts)


def render_html_document(doc: PdfDocument) -> str:
    """Render a PdfDocument as HTML matching the PDF export layout."""
    cover_html = _render_cover(doc.cover, doc.meta)
    sections_html = "".join(_render_section(s) for s in doc.sections)
    footer = doc.footer
    footer_text = (
        f"{footer.confidential_note} "
        f"Generated by {footer.generator} · {footer.exported_at}"
    )
    title = _esc(doc.cover.headline)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title}</title>
<style>{html_styles()}</style>
</head>
<body>
<article class="report">
{cover_html}
<div class="page-break" aria-hidden="true"></div>
<main class="content">
{sections_html}
</main>
<footer class="report-footer">{_esc(footer_text)}</footer>
</article>
</body>
</html>"""
