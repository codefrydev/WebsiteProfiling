"""Findings adapter — normalizes and groups all audit issues."""
from __future__ import annotations

from typing import Any

from ....tools.export_audit_data import _issues_rows, _priority_sort_key
from ..document import PdfSection, PdfTruncation
from ..normalize import group_issues_for_pdf, normalize_issue_for_pdf
from ..options import PdfBuildOptions
from . import register


@register("findings")
def adapt_findings(payload: dict[str, Any], opts: PdfBuildOptions) -> list[PdfSection]:
    raw_rows = _issues_rows(payload)
    if not raw_rows:
        return []

    raw_rows = sorted(raw_rows, key=_priority_sort_key)
    total = len(raw_rows)
    capped = raw_rows[: opts.limits.issues_total]

    pdf_issues = [
        normalize_issue_for_pdf(row, include_recommendation=opts.include_recommendations)
        for row in capped
    ]

    groups = group_issues_for_pdf(
        pdf_issues,
        issues_per_group=opts.limits.issues_per_group,
        issues_total=opts.limits.issues_total,
    )

    if not groups:
        return []

    section_trunc: PdfTruncation | None = None
    if total > opts.limits.issues_total:
        section_trunc = PdfTruncation(
            shown=opts.limits.issues_total,
            total=total,
            reason="limit",
            continue_in=["CSV", "workbook"],
        )

    return [PdfSection(
        id="findings",
        section_key="findings",
        title="Findings",
        priority=20,
        page_break_before=False,
        blocks=list(groups),  # type: ignore[arg-type]
        truncation=section_trunc,
    )]
