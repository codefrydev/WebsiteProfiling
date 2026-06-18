"""Appendix adapter — crawled URL sample and data-source glossary."""
from __future__ import annotations

from typing import Any

from ....tools.export_audit_data import _GLOSSARY_ROWS
from ..document import (
    KeyValueBlock,
    PdfSection,
    PdfTruncation,
    SpacerBlock,
    UrlListBlock,
)
from ..options import PdfBuildOptions
from . import register


@register("appendix")
def adapt_appendix(payload: dict[str, Any], opts: PdfBuildOptions) -> list[PdfSection]:
    if not opts.include_appendix:
        return []

    sections: list[PdfSection] = []

    # --- Crawled URLs sample ---
    links = [l for l in (payload.get("links") or []) if isinstance(l, dict)]
    if links:
        limit = opts.limits.urls_sample
        sample = links[:limit]
        rows = [
            {
                "url": str(lnk.get("url") or ""),
                "status": str(lnk.get("status") or ""),
                "title": str(lnk.get("title") or "").strip(),
            }
            for lnk in sample
        ]
        has_titles = any(r["title"] for r in rows)
        trunc = PdfTruncation(shown=len(rows), total=len(links)) if len(links) > limit else None
        sections.append(PdfSection(
            id="appendix.urls",
            section_key="links",
            title="Crawled URLs (sample)",
            priority=80,
            page_break_before=False,
            blocks=[
                UrlListBlock(
                    id="appendix.url_list",
                    rows=rows,
                    show_title=has_titles,
                    truncation=trunc,
                ),
                SpacerBlock(id="appendix.url_spacer", height_pt=6),
            ],
        ))

    # --- Glossary ---
    if opts.include_glossary:
        gloss_rows = [(term, desc) for term, desc in _GLOSSARY_ROWS]
        sections.append(PdfSection(
            id="appendix.glossary",
            section_key="core",
            title="Data source glossary",
            priority=90,
            blocks=[KeyValueBlock(id="appendix.glossary_kv", rows=gloss_rows, layout="glossary")],
        ))

    return sections
