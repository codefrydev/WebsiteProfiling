"""Pipeline entrypoint for page markdown extraction."""
from __future__ import annotations

from typing import Any, Optional

from ..console_io import console_print
from ..db import db_session, get_latest_crawl_run_id
from ..db.markdown_store import write_page_markdown_batch


_WRITE_BATCH = 50


def run_page_markdown_extraction(
    crawl_run_id: Optional[int] = None,
    *,
    strategy: str = "main_only",
    workers: int = 4,
    overwrite: bool = True,
    property_id: Optional[int] = None,
) -> dict[str, Any]:
    """Extract markdown from stored HTML for a crawl run and persist to crawl_page_markdown."""
    strat = "full_body" if strategy == "full_body" else "main_only"
    summary: dict[str, Any] = {
        "crawl_run_id": None,
        "pages_extracted": 0,
        "strategy": strat,
    }

    with db_session() as conn:
        run_id = crawl_run_id if crawl_run_id is not None else get_latest_crawl_run_id(conn)
        if run_id is None:
            console_print("  Page markdown: no crawl run in database — skipped.", flush=True)
            return summary

        run_id = int(run_id)
        summary["crawl_run_id"] = run_id

        # Check that HTML is stored for this run
        from ..db.html_store import read_page_html_for_run
        first_html = next(iter(read_page_html_for_run(conn, run_id, limit=1)), None)
        if first_html is None:
            console_print(
                f"  Page markdown: no stored HTML for crawl run {run_id}. "
                "Enable store_page_html and re-crawl.",
                flush=True,
            )
            return summary

        console_print(f"  Page markdown: extracting (run_id={run_id}, strategy={strat})...", flush=True)

        from .batch import extract_run_markdown
        results = extract_run_markdown(conn, run_id, strategy=strat, workers=workers, overwrite=overwrite)

        # Write in batches to avoid large transactions
        written = 0
        for i in range(0, len(results), _WRITE_BATCH):
            chunk = results[i : i + _WRITE_BATCH]
            write_page_markdown_batch(conn, chunk, run_id, property_id, commit=True)
            written += len(chunk)
            console_print(f"  Page markdown: {written}/{len(results)} pages written...", flush=True)

        summary["pages_extracted"] = len(results)

    console_print(f"  Page markdown: done ({summary['pages_extracted']} pages).", flush=True)
    return summary
