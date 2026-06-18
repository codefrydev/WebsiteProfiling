"""Core adapter — audit-details section (category scores live on cover)."""
from __future__ import annotations

from typing import Any

from ....tools.export_audit_data import _format_report_date, _summary_lines
from ..document import KeyValueBlock, PdfSection, SpacerBlock
from ..options import PdfBuildOptions
from . import register


@register("core")
def adapt_core(payload: dict[str, Any], opts: PdfBuildOptions) -> list[PdfSection]:
    sections: list[PdfSection] = []

    # Category scores are rendered on the cover page — not duplicated here.

    # --- Audit details section ---
    summary_rows = _summary_lines(payload)
    if summary_rows:
        formatted_rows: list[tuple[str, str]] = []
        for key, val in summary_rows:
            if key == "Report generated":
                formatted_rows.append((key, _format_report_date(val)))
            else:
                formatted_rows.append((key, val))
        sections.append(PdfSection(
            id="core.audit_details",
            section_key="core",
            title="Audit details",
            priority=70,
            blocks=[
                KeyValueBlock(id="core.audit_kv", rows=formatted_rows, layout="audit"),
                SpacerBlock(id="core.audit_spacer", height_pt=6),
            ],
        ))

    return sections
