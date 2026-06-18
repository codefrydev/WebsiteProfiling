"""build_pdf_document — assembles a PdfDocument from a raw report payload."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from ...tools.export_audit_data import (
    _executive_export_data,
    _executive_source_label,
    _format_report_date,
    _issue_priority_counts,
    _issues_rows,
    _overall_score,
    _priority_sort_key,
    _score_band,
)
from .document import (
    SCHEMA_VERSION,
    PdfCoverBlock,
    PdfDocument,
    PdfFooterBlock,
    PdfIssue,
    PdfMeta,
    PdfScoreHero,
    ScoreCard,
    ScoreCardsBlock,
    StatChip,
    StatGridBlock,
)
from .normalize import normalize_issue_for_pdf
from .options import PdfBuildOptions
from .adapters import SECTION_ADAPTERS


def _build_meta(
    payload: dict[str, Any],
    opts: PdfBuildOptions,
    exported_at: str,
    all_issue_counts: dict[str, int],
    overall: Optional[int],
    included_sections: list[str],
) -> PdfMeta:
    site = str(payload.get("site_name") or "Site Audit")
    generated_raw = str(payload.get("report_generated_at") or "")
    generated = _format_report_date(generated_raw)
    meta_block = payload.get("report_meta") or {}
    data_sources: list[str] = []
    if isinstance(meta_block, dict):
        data_sources = [str(s) for s in (meta_block.get("data_sources") or [])]
    report_title = str(payload.get("report_title") or "Technical SEO Audit Report")
    return PdfMeta(
        report_id=opts.report_id,
        property=site,
        report_title=report_title,
        generated_at=generated,
        exported_at=exported_at,
        data_sources=data_sources,
        health_score=overall,
        issue_counts=all_issue_counts,
        included_sections=included_sections,
    )


def _build_cover(
    payload: dict[str, Any],
    opts: PdfBuildOptions,
    overall: Optional[int],
    all_issue_counts: dict[str, int],
) -> PdfCoverBlock:
    site = str(payload.get("site_name") or "Site Audit")
    report_title = str(payload.get("report_title") or "Technical SEO Audit Report")

    score_txt, band = _score_band(float(overall) if overall is not None else None)
    hero = PdfScoreHero(score=score_txt, band=band, label="Overall health score")  # type: ignore[arg-type]

    priority_chips = [
        StatChip(label="Critical", value=str(all_issue_counts["critical"]), tone="critical"),
        StatChip(label="High", value=str(all_issue_counts["high"]), tone="high"),
        StatChip(label="Medium", value=str(all_issue_counts["medium"]), tone="medium"),
        StatChip(label="Low", value=str(all_issue_counts["low"]), tone="low"),
    ]
    priority_strip = StatGridBlock(id="cover.priority_strip", chips=priority_chips, columns=4)

    categories = payload.get("categories") or []
    score_cards: list[ScoreCard] = []
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        from ...reporting.terminology import category_display_name
        name = category_display_name(str(cat.get("name") or "Category"))
        raw = cat.get("score")
        sv: float | None = None
        if raw is not None:
            try:
                sv = float(raw)
            except (TypeError, ValueError):
                pass
        stxt, sband = _score_band(sv)
        issue_n = len(cat.get("issues") or [])
        score_cards.append(ScoreCard(name=name, score=stxt, issue_count=issue_n, tone=sband))  # type: ignore[arg-type]
    cat_scores_block = ScoreCardsBlock(id="cover.category_scores", cards=score_cards)

    # Executive summary
    exec_data = _executive_export_data(payload)
    exec_summary = exec_data.get("summary") or None
    exec_source = _executive_source_label(exec_data.get("source") or "") if exec_data.get("source") else None
    priorities_list: list[str] = exec_data.get("priorities") or []

    # Top issues for cover — one row per distinct headline; prefer rows with a URL
    all_rows = sorted(_issues_rows(payload), key=_priority_sort_key)
    top_limit = opts.limits.top_issues_cover
    headline_order: list[str] = []
    by_headline: dict[str, PdfIssue] = {}
    for row in all_rows:
        issue = normalize_issue_for_pdf(row, include_recommendation=False)
        if issue.headline not in by_headline:
            headline_order.append(issue.headline)
            by_headline[issue.headline] = issue
        elif not by_headline[issue.headline].url and issue.url:
            by_headline[issue.headline] = issue
    top_issues = [by_headline[h] for h in headline_order[:top_limit]]

    return PdfCoverBlock(
        headline=f"Site Audit — {site}",
        subtitle=report_title,
        hero=hero,
        priority_strip=priority_strip,
        category_scores=cat_scores_block,
        executive_summary=exec_summary,
        executive_source=exec_source,
        priorities_list=priorities_list[:8],
        top_issues=top_issues,
    )


def build_pdf_document(
    payload: dict[str, Any],
    opts: Optional[PdfBuildOptions] = None,
) -> PdfDocument:
    """Transform a raw ReportPayload dict into a PdfDocument ready for rendering."""
    if opts is None:
        opts = PdfBuildOptions()

    exported_at = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    overall = _overall_score(payload)
    all_issues = _issues_rows(payload)
    all_issue_counts = _issue_priority_counts(all_issues)

    effective_sections = opts.effective_sections()

    # Run each requested adapter
    sections: list = []
    for key in effective_sections:
        adapter = SECTION_ADAPTERS.get(key)
        if adapter is None:
            continue
        result = adapter(payload, opts)
        sections.extend(result)

    # Sort sections by priority
    sections.sort(key=lambda s: s.priority)

    meta = _build_meta(
        payload, opts, exported_at, all_issue_counts, overall,
        included_sections=effective_sections,
    )
    cover = _build_cover(payload, opts, overall, all_issue_counts)
    footer = PdfFooterBlock(exported_at=exported_at)

    return PdfDocument(
        schema_version=SCHEMA_VERSION,
        document_kind="audit",
        meta=meta,
        cover=cover,
        sections=sections,
        footer=footer,
        appendix=None,  # appendix content is included as PdfSections in sections list
    )
