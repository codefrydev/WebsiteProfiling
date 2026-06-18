"""ReportLab renderer — converts PdfDocument → PDF bytes.

Layout rules:
- Every table cell is wrapped in Paragraph (prevents column bleed/overflow).
- Findings are rendered as stacked item blocks (issue_group), not 4-col tables.
- LongTable + repeatRows=1 for metric/url tables.
- Page numbers via onFirstPage / onLaterPages callbacks.
"""
from __future__ import annotations

import html
import io
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
    PdfMeta,
    PdfSection,
    ScoreCardsBlock,
    SpacerBlock,
    StatGridBlock,
    UrlListBlock,
)
from . import styles as S


def _content_w_in() -> float:
    return S.CONTENT_WIDTH_IN


def _col_w_in(cols: int) -> float:
    return _content_w_in() / cols


def _content_w_pt() -> float:
    from reportlab.lib.units import inch
    return _content_w_in() * inch


def _grid_table_style() -> Any:
    from reportlab.platypus import TableStyle
    style = TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ])
    return style


def _require_reportlab() -> None:
    try:
        from reportlab.lib import colors  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("PDF export requires reportlab (pip install reportlab)") from exc


# ---------------------------------------------------------------------------
# ReportLab helpers
# ---------------------------------------------------------------------------

def _rl_colors():
    from reportlab.lib import colors
    return colors


def _hex(color_str: str):
    return _rl_colors().HexColor(color_str)


def _make_styles():
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    base = getSampleStyleSheet()

    def ps(name: str, parent_name: str = "Normal", **kwargs) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base[parent_name], **kwargs)

    return {
        "title": ps("ATitle", "Heading1", fontSize=20, textColor=_hex(S.INK),
                      spaceAfter=2, leading=24, spaceBefore=0),
        "subtitle": ps("ASubtitle", fontSize=11, textColor=_hex(S.MUTED), spaceAfter=4, leading=14),
        "section": ps("ASection", "Heading2", fontSize=11, textColor=_hex(S.INK),
                      spaceBefore=12, spaceAfter=4, borderPad=0),
        "subsection": ps("ASubsection", "Heading3", fontSize=10, textColor=_hex(S.INK),
                         spaceBefore=6, spaceAfter=4),
        "body": ps("ABody", fontSize=9, leading=13, textColor=_hex(S.INK)),
        "body_italic": ps("ABodyI", fontSize=9, leading=13, textColor=_hex(S.MUTED), italic=True),
        "muted": ps("AMuted", fontSize=8, leading=11, textColor=_hex(S.MUTED)),
        "url": ps("AUrl", fontName="Courier", fontSize=8, leading=10,
                  textColor=_hex(S.BRAND_ACCENT), wordWrap="CJK"),
        "kv_key": ps("AKvKey", fontSize=9, leading=12, textColor=_hex(S.INK), fontName="Helvetica-Bold"),
        "kv_val": ps("AKvVal", fontSize=9, leading=12, textColor=_hex(S.INK)),
        "th": ps("ATh", fontSize=8, leading=10, textColor=_hex(S.MUTED), fontName="Helvetica-Bold"),
        "td": ps("ATd", fontSize=9, leading=12, textColor=_hex(S.INK)),
        "td_url": ps("ATdUrl", fontName="Courier", fontSize=8, leading=10,
                     textColor=_hex(S.BRAND_ACCENT), wordWrap="CJK"),
        "td_link": ps("ATdLink", fontSize=8, leading=11, textColor=_hex(S.BRAND_ACCENT), wordWrap="CJK"),
        "kv_desc": ps("AKvDesc", fontSize=9, leading=13, textColor=_hex(S.INK)),
        "cover_title": ps("ACoverTitle", fontSize=22, textColor=_hex("#f8fafc"),
                          spaceAfter=4, leading=28, fontName="Helvetica-Bold"),
        "cover_sub": ps("ACoverSub", fontSize=11, textColor=_hex("#cbd5e1"), spaceAfter=2),
        "hero_score": ps("AHeroScore", fontSize=28, leading=32, fontName="Helvetica-Bold"),
        "hero_suffix": ps("AHeroSuffix", fontSize=10, textColor=_hex(S.MUTED), alignment=2),
        "score_value": ps("AScoreVal", fontSize=15, leading=18, fontName="Helvetica-Bold", alignment=1),
        "score_name": ps("AScoreName", fontSize=8, leading=11, alignment=1, spaceAfter=2),
        "score_meta": ps("AScoreMeta", fontSize=7, leading=9, textColor=_hex(S.MUTED), alignment=1),
        "stat_value": ps("AStatVal", fontSize=18, leading=20, fontName="Helvetica-Bold", alignment=1),
        "stat_label": ps("AStatLabel", fontSize=8, leading=10, textColor=_hex(S.MUTED), alignment=1),
        "cover_meta": ps("ACoverMetaLine", fontSize=9, textColor=_hex(S.MUTED), spaceAfter=10, leading=12),
        "badge": ps("ABadge", fontSize=8, leading=10, fontName="Helvetica-Bold"),
        "footer": ps("AFooter", fontSize=7, textColor=_hex(S.MUTED), leading=9),
        "issue_headline": ps("AIssHeadline", fontSize=9, leading=12,
                              textColor=_hex(S.INK), fontName="Helvetica-Bold"),
        "issue_rec": ps("AIssRec", fontSize=8, leading=11, textColor=_hex(S.MUTED), italic=True),
        "callout_info": ps("ACalloutInfo", fontSize=9, leading=12,
                           textColor=_hex(S.BRAND_ACCENT), leftIndent=8),
        "callout_warn": ps("ACalloutWarn", fontSize=9, leading=12,
                           textColor=_hex(S.FAIR), leftIndent=8),
        "callout_critical": ps("ACalloutCrit", fontSize=9, leading=12,
                               textColor=_hex(S.CRITICAL_FG), leftIndent=8),
        "exec_body": ps("AExecBody", fontSize=10, leading=15, textColor=_hex(S.INK), spaceAfter=4),
        "exec_subhead": ps("AExecSub", fontSize=8, leading=11, textColor=_hex(S.MUTED),
                           fontName="Helvetica-Bold", spaceBefore=6, spaceAfter=3),
        "exec_bullet": ps("AExecBullet", fontSize=9, leading=13, textColor=_hex(S.INK), leftIndent=10),
        "exec_source": ps("AExecSource", fontSize=7, leading=9, textColor=_hex(S.BRAND_ACCENT),
                          fontName="Helvetica-Bold", spaceAfter=4),
        "section_lead": ps("ASectionLead", fontSize=8, leading=11, textColor=_hex(S.MUTED), spaceAfter=6),
        "td_site": ps("ATdSite", fontSize=8, leading=10, textColor=_hex(S.MUTED), italic=True),
    }


def _p(text: str, style) -> Any:
    """Plain-text paragraph — content is HTML-escaped."""
    from reportlab.platypus import Paragraph
    return Paragraph(html.escape(str(text)), style)


def _p_html(markup: str, style) -> Any:
    """Markup paragraph — caller must escape user content before embedding tags."""
    from reportlab.platypus import Paragraph
    return Paragraph(str(markup), style)


def _safe_p(text: str, style, fallback: str = "—") -> Any:
    return _p(text if text else fallback, style)


def _table_style_base():
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _hex(S.HEADER_BG)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.3, _hex(S.BORDER)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ])


def _page_callback(canvas, doc, footer_text: str) -> None:
    from reportlab.lib.units import inch
    page_w, _ = doc.pagesize
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(_hex(S.MUTED))
    canvas.drawString(0.55 * inch, 0.35 * inch, footer_text)
    page_num = f"Page {doc.page}"
    canvas.drawRightString(page_w - 0.55 * inch, 0.35 * inch, page_num)
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Block renderers — each returns a list of flowables
# ---------------------------------------------------------------------------

def _render_heading(block: HeadingBlock, st: dict) -> list:
    from reportlab.platypus import Spacer
    style = st["section"] if block.level == 2 else st["subsection"]
    return [_p(block.text, style), Spacer(1, 2)]


def _render_paragraph(block: ParagraphBlock, st: dict) -> list:
    style = st["body_italic"] if block.italic else st["body"]
    return [_p(block.text, style)]


def _render_callout(block: CalloutBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table, TableStyle
    style_map = {"info": st["callout_info"], "warn": st["callout_warn"], "critical": st["callout_critical"]}
    bg_map = {"info": "#eff6ff", "warn": S.FAIR_BG, "critical": S.CRITICAL_BG}
    s = style_map.get(block.severity, st["body"])
    bg = bg_map.get(block.severity, "#eff6ff")
    cell = [[_p(block.text, s)]]
    tbl = Table(cell, colWidths=[_content_w_in() * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _hex(bg)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 2, _hex(S.BRAND_ACCENT)),
    ]))
    return [tbl, Spacer(1, 4)]


def _render_spacer(block: SpacerBlock, _st: dict) -> list:
    from reportlab.platypus import Spacer
    return [Spacer(1, block.height_pt)]


def _render_kpi_row(block: KpiRowBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table, TableStyle
    if not block.items:
        return []
    n = len(block.items)
    w = _col_w_in(n)
    row_data = [[_p_html(f"<b>{html.escape(i.value)}</b><br/><font size='7' color='{S.MUTED}'>{html.escape(i.label)}</font>", st["body"]) for i in block.items]]
    tbl = Table(row_data, colWidths=[w * inch] * n)
    tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.3, _hex(S.BORDER)),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, _hex(S.BORDER)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (-1, -1), _hex(S.SURFACE_MUTED)),
    ]))
    return [tbl, Spacer(1, 8)]


def _render_stat_grid(block: StatGridBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table
    if not block.chips:
        return []
    n = block.columns
    col_w = _col_w_in(n)
    row: list = []
    for chip in block.chips:
        fg, _bg = S.PRIORITY_TONES.get(chip.tone, (S.INK, S.SURFACE_MUTED))
        val_style = ParagraphStyle_compat(st["stat_value"], textColor=_hex(fg))
        row.append(_cell_stack([(chip.value, val_style), (chip.label, st["stat_label"])], col_w))
    while len(row) < n:
        row.append("")
    tbl = Table([row], colWidths=[col_w * inch] * n, rowHeights=[0.62 * inch])
    ts = _grid_table_style()
    for i, chip in enumerate(block.chips):
        _fg, bg = S.PRIORITY_TONES.get(chip.tone, (S.INK, S.SURFACE_MUTED))
        ts.add("BACKGROUND", (i, 0), (i, 0), _hex(bg))
    tbl.setStyle(ts)
    return [tbl, Spacer(1, 12)]


def ParagraphStyle_compat(base_style, **overrides):
    """Clone a ParagraphStyle with attribute overrides."""
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle(
        f"{base_style.name}_override",
        parent=base_style,
        **overrides,
    )


def _section_heading(text: str, st: dict) -> list:
    from reportlab.platypus import HRFlowable, Spacer
    return [
        _p(text, st["section"]),
        HRFlowable(
            width=_content_w_pt(),
            thickness=0.5,
            color=_hex(S.BORDER),
            spaceBefore=0,
            spaceAfter=8,
        ),
    ]


def _cell_stack(rows: list[tuple[str, Any]], col_w_in: float):
    """Borderless vertically stacked paragraphs for a grid cell."""
    from reportlab.lib.units import inch
    from reportlab.platypus import Table, TableStyle
    data = [[_p(text, style)] for text, style in rows]
    tbl = Table(data, colWidths=[col_w_in * inch])
    tbl.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _data_table_style() -> Any:
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
        ("LINEBELOW", (0, 0), (-1, -2), 0.35, _hex(S.BORDER)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ])


def _apply_row_zebra(ts: Any, row_count: int, start_row: int = 0) -> None:
    for r in range(start_row, start_row + row_count):
        bg = S.SURFACE_MUTED if (r - start_row) % 2 else "#ffffff"
        ts.add("BACKGROUND", (0, r), (-1, r), _hex(bg))


def _http_status_badge(code: str, st: dict) -> Any:
    from reportlab.lib.units import inch
    from reportlab.platypus import Table, TableStyle
    c = str(code or "").strip()
    if c == "200":
        fg, bg = S.GOOD, S.GOOD_BG
    elif c.startswith("3"):
        fg, bg = S.FAIR, S.FAIR_BG
    elif c and c[0] in "45":
        fg, bg = S.POOR, S.POOR_BG
    else:
        fg, bg = S.MUTED, S.SURFACE_MUTED
    badge_style = ParagraphStyle_compat(st["badge"], textColor=_hex(fg), fontSize=8)
    label = c or "—"
    tbl = Table([[ _p(label, badge_style) ]], colWidths=[0.52 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _hex(bg)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BOX", (0, 0), (-1, -1), 0.4, _hex(fg)),
    ]))
    return tbl


def _render_key_value(block: KeyValueBlock, st: dict) -> list:
    layout = getattr(block, "layout", "default") or "default"
    if layout == "audit":
        return _render_audit_kv(block, st)
    if layout == "glossary":
        return _render_glossary_kv(block, st)
    return _render_default_kv(block, st)


def _render_default_kv(block: KeyValueBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer
    if not block.rows:
        return []
    data = [[_p(k, st["kv_key"]), _p(v, st["kv_val"])] for k, v in block.rows]
    kv_key_w = _content_w_in() * 0.30
    kv_val_w = _content_w_in() - kv_key_w
    tbl = LongTable(data, colWidths=[kv_key_w * inch, kv_val_w * inch], repeatRows=0)
    ts = _table_style_base()
    from reportlab.platypus import TableStyle
    ts.add("BACKGROUND", (0, 0), (-1, -1), _hex(S.SURFACE_MUTED))
    ts.add("BACKGROUND", (0, 0), (0, -1), _hex(S.HEADER_BG))
    ts.add("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold")
    tbl.setStyle(ts)
    return [tbl, Spacer(1, 6)]


def _render_audit_kv(block: KeyValueBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer
    if not block.rows:
        return []
    kv_key_w = 1.65
    kv_val_w = _content_w_in() - kv_key_w
    data = [[_p(k, st["kv_key"]), _p(v, st["kv_val"])] for k, v in block.rows]
    tbl = LongTable(data, colWidths=[kv_key_w * inch, kv_val_w * inch], repeatRows=0)
    ts = _data_table_style()
    _apply_row_zebra(ts, len(block.rows))
    tbl.setStyle(ts)
    return [tbl, Spacer(1, 10)]


def _render_glossary_kv(block: KeyValueBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer
    if not block.rows:
        return []
    term_w = 1.55
    desc_w = _content_w_in() - term_w
    data = [[_p(k, st["kv_key"]), _p(v, st["kv_desc"])] for k, v in block.rows]
    tbl = LongTable(data, colWidths=[term_w * inch, desc_w * inch], repeatRows=0)
    ts = _data_table_style()
    for r in range(len(block.rows)):
        ts.add("BACKGROUND", (0, r), (0, r), _hex(S.HEADER_BG))
        val_bg = "#ffffff" if r % 2 == 0 else S.SURFACE_MUTED
        ts.add("BACKGROUND", (1, r), (1, r), _hex(val_bg))
    tbl.setStyle(ts)
    return [tbl, Spacer(1, 10)]


def _render_score_cards(block: ScoreCardsBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table
    if not block.cards:
        return []
    cols = S.GRID_COLS
    col_w = _col_w_in(cols)
    grid_rows: list[list] = []
    row: list = []
    for card in block.cards:
        score_color = S.SCORE_TONES.get(card.tone, S.MUTED)
        val_style = ParagraphStyle_compat(st["score_value"], textColor=_hex(score_color))
        issue_label = f"{card.issue_count} issue{'s' if card.issue_count != 1 else ''}"
        row.append(_cell_stack([
            (card.score or "—", val_style),
            (card.name, st["score_name"]),
            (issue_label, st["score_meta"]),
        ], col_w))
        if len(row) == cols:
            grid_rows.append(row)
            row = []
    if row:
        while len(row) < cols:
            row.append("")
        grid_rows.append(row)
    tbl = Table(grid_rows, colWidths=[col_w * inch] * cols, rowHeights=[0.78 * inch] * len(grid_rows))
    ts = _grid_table_style()
    for r_idx, grid_row in enumerate(grid_rows):
        for c_idx in range(cols):
            if c_idx < len(grid_row) and grid_row[c_idx] != "":
                ts.add("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), _hex(S.SURFACE_MUTED))
    tbl.setStyle(ts)
    return [tbl, Spacer(1, 12)]


def _url_list_table_style(col_count: int) -> Any:
    from reportlab.platypus import TableStyle
    ts = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _hex(S.HEADER_BG)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), _hex(S.MUTED)),
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _hex(S.BORDER)),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, _hex(S.BORDER)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ])
    if col_count >= 2:
        ts.add("ALIGN", (1, 0), (1, -1), "CENTER")
    return ts


def _render_url_list(block: UrlListBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer
    if not block.rows:
        return []

    show_title = getattr(block, "show_title", True)
    if show_title:
        header = [_p("URL", st["th"]), _p("Status", st["th"]), _p("Title", st["th"])]
        status_w = 0.72
        title_w = 1.85
        url_w = _content_w_in() - status_w - title_w
        col_widths = [url_w * inch, status_w * inch, title_w * inch]
    else:
        header = [_p("URL", st["th"]), _p("Status", st["th"])]
        status_w = 0.72
        url_w = _content_w_in() - status_w
        col_widths = [url_w * inch, status_w * inch]

    data: list = [header]
    for r in block.rows:
        url_cell = _safe_p(r.get("url", ""), st["td_link"])
        status_cell = _http_status_badge(str(r.get("status", "")), st)
        if show_title:
            title = str(r.get("title") or "").strip()
            data.append([url_cell, status_cell, _p(title, st["td"]) if title else _p("—", st["td_site"])])
        else:
            data.append([url_cell, status_cell])

    tbl = LongTable(data, colWidths=col_widths, repeatRows=1)
    ts = _url_list_table_style(len(col_widths))
    # Zebra only data rows (skip header)
    for r in range(1, len(data)):
        bg = S.SURFACE_MUTED if (r - 1) % 2 else "#ffffff"
        ts.add("BACKGROUND", (0, r), (-1, r), _hex(bg))
    tbl.setStyle(ts)

    parts: list = [tbl]
    if block.truncation:
        t = block.truncation
        note = f"Showing {t.shown} of {t.total} URLs. Export CSV/workbook for full inventory."
        parts.append(Spacer(1, 4))
        parts.append(_p(note, st["muted"]))
    parts.append(Spacer(1, 10))
    return parts


def _render_metric_table(block: MetricTableBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer

    if not block.columns or not block.rows:
        return []

    _width_map = {"narrow": 0.75, "medium": 1.5, "wide": 2.5, "url": 2.0}
    total_cols = len(block.columns)
    available = _content_w_in()
    col_widths = [_width_map.get(c.width, 1.5) * inch for c in block.columns]
    # Scale to available width
    total_specified = sum(col_widths)
    if total_specified > available * inch:
        scale = (available * inch) / total_specified
        col_widths = [w * scale for w in col_widths]

    header = [_p(c.label, st["th"]) for c in block.columns]
    data: list = [header]
    for r in block.rows:
        cell_style = lambda col: st["td_url"] if col.width == "url" else st["td"]
        data.append([_safe_p(str(r.get(c.key, "")), cell_style(c)) for c in block.columns])

    tbl = LongTable(data, colWidths=col_widths, repeatRows=1 if block.repeat_header else 0)
    tbl.setStyle(_table_style_base())
    parts: list = [tbl]
    if block.truncation:
        t = block.truncation
        note = f"Showing {t.shown} of {t.total} rows. Full data in {', '.join(t.continue_in)}."
        parts.append(Spacer(1, 3))
        parts.append(_p(note, st["muted"]))
    parts.append(Spacer(1, 8))
    return parts


def _priority_badge(priority: str, st: dict) -> Any:
    fg, bg = S.PRIORITY_TONES.get(priority, (S.INK, S.SURFACE_MUTED))
    from reportlab.lib.units import inch
    from reportlab.platypus import Table, TableStyle
    badge_style = ParagraphStyle_compat(st["badge"], textColor=_hex(fg), fontSize=7)
    cell = [[_p(priority.upper(), badge_style)]]
    tbl = Table(cell, colWidths=[0.62 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _hex(bg)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(fg)),
    ]))
    return tbl


def _issue_location_cell(issue: PdfIssue, st: dict) -> Any:
    if issue.path:
        return _p(issue.path, st["td_url"])
    if issue.url:
        return _p(issue.url, st["td_url"])
    return _p("Site-wide", st["td_site"])


def _top_issues_table_style():
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _hex(S.HEADER_BG)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), _hex(S.MUTED)),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _hex(S.BORDER)),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, _hex(S.BORDER)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_hex("#ffffff"), _hex(S.SURFACE_MUTED)]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
    ])


def _render_executive_panel(cover: PdfCoverBlock, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table, TableStyle

    rows: list[list] = []
    if cover.executive_source:
        rows.append([_p(f"Source · {cover.executive_source}", st["exec_source"])])
    if cover.executive_summary:
        rows.append([_p(cover.executive_summary, st["exec_body"])])
    if cover.priorities_list:
        rows.append([_p("Recommended priorities", st["exec_subhead"])])
        for i, pri in enumerate(cover.priorities_list[:6], 1):
            rows.append([_p(f"{i}.  {pri}", st["exec_bullet"])])

    if not rows:
        return []

    content_w = _content_w_in()
    inner = Table(rows, colWidths=[content_w * inch])
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    panel = Table([[inner]], colWidths=[content_w * inch])
    panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _hex(S.SURFACE_MUTED)),
        ("LINEBEFORE", (0, 0), (0, -1), 3, _hex(S.BRAND_ACCENT)),
        ("BOX", (0, 0), (-1, -1), 0.5, _hex(S.BORDER)),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [panel, Spacer(1, 14)]


def _render_top_issues_table(issues: list[PdfIssue], st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer

    if not issues:
        return []

    content_w = _content_w_in()
    pri_w = 0.78
    loc_w = 1.55
    issue_w = content_w - pri_w - loc_w

    header = [
        _p("Priority", st["th"]),
        _p("Issue", st["th"]),
        _p("Location", st["th"]),
    ]
    rows: list = [header]
    for iss in issues:
        rows.append([
            _priority_badge(iss.priority, st),
            _p(iss.headline, st["td"]),
            _issue_location_cell(iss, st),
        ])

    tbl = LongTable(
        rows,
        colWidths=[pri_w * inch, issue_w * inch, loc_w * inch],
        repeatRows=1,
    )
    tbl.setStyle(_top_issues_table_style())
    return [tbl, Spacer(1, 10)]


def _render_single_issue(issue: PdfIssue, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table, TableStyle
    fg, bg = S.PRIORITY_TONES.get(issue.priority, (S.INK, S.SURFACE_MUTED))

    lines: list = [[_p(issue.headline, st["issue_headline"])]]
    if issue.related_urls:
        max_show = 10
        for url in issue.related_urls[:max_show]:
            lines.append([_p(f"• {url}", st["url"])])
        extra = len(issue.related_urls) - max_show
        if extra > 0:
            lines.append([_p(f"• … and {extra} more (see CSV export)", st["muted"])])
    elif issue.url:
        lines.append([_p(issue.url, st["url"])])
    if issue.recommendation:
        lines.append([_p(f"Fix: {issue.recommendation}", st["issue_rec"])])

    inner = Table(lines, colWidths=[(_content_w_in() - 0.3) * inch])
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    outer = Table([[inner]], colWidths=[_content_w_in() * inch])
    outer.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, -1), 3, _hex(fg)),
        ("BACKGROUND", (0, 0), (-1, -1), _hex(bg)),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return [outer, Spacer(1, 6)]


def _render_issue_group(block: IssueGroupBlock, st: dict) -> list:
    from reportlab.platypus import Spacer
    parts: list = []
    parts.append(_p(block.group_label, st["subsection"]))

    if block.render_as == "compact_table":
        parts.extend(_render_issue_table_compact(block.issues, st))
    else:
        for issue in block.issues:
            parts.extend(_render_single_issue(issue, st))

    if block.truncation:
        t = block.truncation
        note = f"Showing {t.shown} of {t.total}. Full list in {', '.join(t.continue_in)}."
        parts.append(_p(note, st["muted"]))

    parts.append(Spacer(1, 8))
    return parts


def _render_issue_table_compact(issues: list[PdfIssue], st: dict) -> list:
    """Two-column Issue | URL table (priority is already in the group heading)."""
    from reportlab.lib.units import inch
    from reportlab.platypus import LongTable, Spacer
    header = [_p("Issue", st["th"]), _p("URL", st["th"])]
    data: list = [header]
    for iss in issues:
        data.append([
            _p(iss.headline, st["td"]),
            _safe_p(iss.url or "", st["td_url"]),
        ])
    issue_w = _content_w_in() * 0.52
    url_w = _content_w_in() - issue_w
    tbl = LongTable(data, colWidths=[issue_w * inch, url_w * inch], repeatRows=1)
    tbl.setStyle(_table_style_base())
    return [tbl, Spacer(1, 4)]


def _render_issue_table(block: IssueTableBlock, st: dict) -> list:
    parts: list = []
    if block.title:
        parts.append(_p(block.title, st["subsection"]))
    parts.extend(_render_issue_table_compact(block.issues, st))
    if block.truncation:
        t = block.truncation
        note = f"Showing {t.shown} of {t.total}. Full list in {', '.join(t.continue_in)}."
        parts.append(_p(note, st["muted"]))
    return parts


def _render_markdown(block: MarkdownBlock, st: dict) -> list:
    import re
    from reportlab.platypus import Spacer
    # Strip HTML-like markdown tags to plain text for safety
    text = re.sub(r"<[^>]+>", " ", block.text)
    return [_p(text, st["body"]), Spacer(1, 4)]


BLOCK_RENDERERS = {
    "heading": _render_heading,
    "paragraph": _render_paragraph,
    "callout": _render_callout,
    "spacer": _render_spacer,
    "kpi_row": _render_kpi_row,
    "stat_grid": _render_stat_grid,
    "key_value": _render_key_value,
    "score_cards": _render_score_cards,
    "url_list": _render_url_list,
    "metric_table": _render_metric_table,
    "issue_group": _render_issue_group,
    "issue_table": _render_issue_table,
    "markdown": _render_markdown,
}


def _flowables_for_block(block: Any, st: dict) -> list:
    btype = getattr(block, "type", None)
    if not getattr(block, "visible", True):
        return []
    renderer = BLOCK_RENDERERS.get(btype)
    if renderer is None:
        return []
    return renderer(block, st)


# ---------------------------------------------------------------------------
# Cover renderer
# ---------------------------------------------------------------------------

def _render_cover(cover: PdfCoverBlock, meta: PdfMeta, st: dict) -> list:
    from reportlab.lib.units import inch
    from reportlab.platypus import Spacer, Table, TableStyle
    parts: list = []

    content_w = _content_w_in()
    score_col = 1.35
    title_col = content_w - score_col

    score_color = S.SCORE_TONES.get(cover.hero.band, S.MUTED)
    score_display = cover.hero.score or "—"
    score_style = ParagraphStyle_compat(
        st["hero_score"], textColor=_hex(score_color), alignment=1, fontSize=32, leading=36,
    )
    suffix_style = ParagraphStyle_compat(st["hero_suffix"], alignment=1)

    score_block = Table(
        [[_p(score_display, score_style)], [_p("/100", suffix_style)]],
        colWidths=[score_col * inch],
    )
    score_block.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    title_row = Table(
        [[_p(cover.headline, st["title"]), score_block]],
        colWidths=[title_col * inch, score_col * inch],
    )
    title_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    parts.append(title_row)
    parts.append(_p(cover.subtitle, st["subtitle"]))

    counts = meta.issue_counts
    total = sum(counts.values())
    meta_line = (
        f"Report generated {meta.generated_at} · {total} findings "
        f"(Critical {counts.get('critical', 0)}, High {counts.get('high', 0)}, "
        f"Medium {counts.get('medium', 0)}, Low {counts.get('low', 0)})"
    )
    parts.append(_p(meta_line, st["cover_meta"]))

    parts.extend(_flowables_for_block(cover.priority_strip, st))

    if cover.category_scores.cards:
        parts.extend(_section_heading("Category scores", st))
        parts.extend(_render_score_cards(cover.category_scores, st))

    if cover.executive_summary or cover.priorities_list:
        parts.extend(_section_heading("Executive summary", st))
        parts.extend(_render_executive_panel(cover, st))

    if cover.top_issues:
        parts.extend(_section_heading("Top traffic-impacting issues", st))
        parts.append(_p(
            "Ranked by severity and traffic impact — address critical and high items first.",
            st["section_lead"],
        ))
        parts.extend(_render_top_issues_table(cover.top_issues, st))

    return parts


# ---------------------------------------------------------------------------
# Section renderer
# ---------------------------------------------------------------------------

def _render_section(section: PdfSection, st: dict) -> list:
    from reportlab.platypus import PageBreak, Spacer
    parts: list = []
    if section.page_break_before:
        parts.append(PageBreak())
    parts.extend(_section_heading(section.title, st))
    if section.source_label:
        parts.append(_p(f"Source: {section.source_label}", st["muted"]))
    for block in section.blocks:
        parts.extend(_flowables_for_block(block, st))
    if section.truncation:
        t = section.truncation
        note = f"Showing {t.shown} of {t.total} issues. Export CSV or workbook for full data."
        parts.append(_p(note, st["muted"]))
    parts.append(Spacer(1, 4))
    return parts


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def render_pdf_document(doc: PdfDocument) -> bytes:
    _require_reportlab()

    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.platypus import PageBreak, SimpleDocTemplate

    buf = io.BytesIO()
    footer_text = (
        f"{doc.footer.confidential_note} "
        f"Generated by {doc.footer.generator} · {doc.footer.exported_at}"
    )

    pdf_doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        title=doc.cover.headline,
        author=doc.footer.generator,
    )

    st = _make_styles()
    story: list = []

    story.extend(_render_cover(doc.cover, doc.meta, st))
    story.append(PageBreak())

    for section in doc.sections:
        story.extend(_render_section(section, st))

    def on_page(canvas, d):
        _page_callback(canvas, d, footer_text)

    pdf_doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
