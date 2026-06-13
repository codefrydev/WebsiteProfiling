"""Pipeline entrypoint for post-crawl content analysis."""
from __future__ import annotations

from typing import Any, Optional

from ..console_io import console_print
from ..db import db_session, get_latest_crawl_run_id
from ..db.crawl_store import merge_crawl_result_fields_batch
from ..progress import emit_phase_done, emit_phase_start, emit_progress
from .batch import analyze_run_html
from .page import ContentStrategy


def run_content_analysis(
    crawl_run_id: Optional[int] = None,
    *,
    excerpt_max_chars: int = 0,
    strategy: str = "main_only",
    workers: int = 4,
) -> dict[str, Any]:
    """Analyze stored HTML for a crawl run and merge metrics into crawl_results."""
    emit_phase_start("content_analysis", message="Analyzing stored page HTML")
    console_print("  Content analysis: reading stored HTML...", flush=True)

    strat: ContentStrategy = "full_body" if strategy == "full_body" else "main_only"
    summary: dict[str, Any] = {"crawl_run_id": None, "pages_analyzed": 0, "strategy": strat}

    with db_session() as conn:
        run_id = crawl_run_id if crawl_run_id is not None else get_latest_crawl_run_id(conn)
        if run_id is None:
            console_print("  Content analysis skipped: no crawl run in database.", flush=True)
            emit_phase_done("content_analysis")
            return summary

        summary["crawl_run_id"] = int(run_id)
        emit_progress("content_analysis", "analyze", message="Analyzing page HTML")
        updates = analyze_run_html(
            conn,
            int(run_id),
            excerpt_max_chars=excerpt_max_chars,
            strategy=strat,
            workers=workers,
        )
        if updates:
            merge_crawl_result_fields_batch(conn, int(run_id), updates)
        summary["pages_analyzed"] = len(updates)

    console_print(f"  Content analysis complete ({summary['pages_analyzed']} pages).", flush=True)
    emit_phase_done("content_analysis")
    return summary
