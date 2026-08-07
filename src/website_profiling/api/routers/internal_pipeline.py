"""Internal bridge: ReportService C# worker runs Python CLI subprocesses in this container."""
from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from website_profiling.worker.runner import execute_subprocess_for_claimed_job

router = APIRouter(prefix="/internal/pipeline", tags=["internal-pipeline"])


@router.post("/execute-subprocess")
def internal_execute_subprocess(body: dict[str, Any]) -> dict[str, Any]:
    job_id = str(body.get("jobId") or "").strip()
    if not job_id:
        raise HTTPException(status_code=400, detail="jobId is required")

    command = body.get("command")
    command_str = str(command).strip() if command is not None else None
    if command_str == "":
        command_str = None

    property_id = body.get("propertyId")
    pid: int | None
    try:
        pid = int(property_id) if property_id is not None else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="propertyId must be a valid integer")

    result = execute_subprocess_for_claimed_job(job_id, command_str, pid)
    return {
        "exitCode": result.exit_code,
        "cancelled": result.cancelled,
        "paused": result.paused,
    }


def _elapsed_ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


@router.post("/preview")
def internal_pipeline_preview(body: dict[str, Any]) -> dict[str, Any]:
    """Run the content-extraction pipeline against one page synchronously, with
    unsaved overrides, for the visual pipeline editor's "Run Preview" action.
    Never persists anything; no DB dependency unless an 'llm'-type custom
    extractor is present (make_llm_resolver opens its own connections)."""
    from bs4 import BeautifulSoup

    from ...content_analysis.constants import CONTENT_ROOT_SELECTORS
    from ...content_analysis.dom_cleanup import cleanup_dom
    from ...content_analysis.html_loader import load_soup
    from ...content_analysis.keywords import top_keywords_json
    from ...content_analysis.main_content import find_main_content
    from ...content_analysis.reading_level import flesch_kincaid_grade
    from ...content_analysis.text_extract import extract_text
    from ...content_analysis.tokenize import count_words, tokenize_words
    from ...crawl.fetchers.static import StaticFetcher
    from ...crawl.llm_selector_cache import make_llm_resolver
    from ...llm_config import load_llm_config_from_db
    from ...page_markdown.html_to_markdown import html_to_markdown

    url = str(body.get("url") or "").strip() or None
    raw_html = body.get("html")
    if not url and not raw_html:
        raise HTTPException(status_code=400, detail="Either 'url' or 'html' is required")

    main_content_selectors = (str(body.get("mainContentSelectors") or "")).strip() or None
    boilerplate_selectors = (str(body.get("boilerplateSelectors") or "")).strip() or None
    custom_extractors = [e for e in (body.get("customExtractors") or []) if isinstance(e, dict)]
    strategy = str(body.get("contentAnalysisStrategy") or "main_only").strip().lower()
    if strategy not in ("main_only", "full_body"):
        strategy = "main_only"

    steps: list[dict[str, Any]] = []
    html_text: str

    if url:
        t0 = time.perf_counter()
        fetcher = StaticFetcher(timeout=12)
        try:
            result = fetcher.fetch(url)
        finally:
            fetcher.close()
        elapsed = _elapsed_ms(t0)
        if not result.text:
            steps.append({
                "name": "fetch", "status": "error", "timingMs": elapsed,
                "error": f"Fetch returned no usable HTML (status={result.status}).",
            })
            return {"status": "error", "steps": steps, "error": steps[-1]["error"]}
        html_text = result.text
        steps.append({
            "name": "fetch", "status": "success", "timingMs": elapsed,
            "summary": f"Fetched {len(html_text)} chars (status {result.status}).",
        })
    else:
        html_text = str(raw_html)
        steps.append({"name": "fetch", "status": "skipped", "timingMs": 0, "summary": "Using provided HTML."})

    t0 = time.perf_counter()
    try:
        soup = load_soup(html_text)
        cleaned = cleanup_dom(soup, boilerplate_selectors=boilerplate_selectors)
    except Exception as e:
        steps.append({"name": "strip_boilerplate", "status": "error", "timingMs": _elapsed_ms(t0), "error": str(e)})
        return {"status": "error", "steps": steps, "error": f"strip_boilerplate failed: {e}"}
    steps.append({
        "name": "strip_boilerplate", "status": "success", "timingMs": _elapsed_ms(t0),
        "summary": "Removed script/style/boilerplate elements.",
    })

    t0 = time.perf_counter()
    try:
        root = find_main_content(cleaned, strategy=strategy, selectors=main_content_selectors)
        matched_selector = None
        if strategy != "full_body":
            for candidate in (s.strip() for s in (main_content_selectors or CONTENT_ROOT_SELECTORS).split(",")):
                if candidate and root in cleaned.select(candidate):
                    matched_selector = candidate
                    break
    except Exception as e:
        steps.append({"name": "find_main_content", "status": "error", "timingMs": _elapsed_ms(t0), "error": str(e)})
        return {"status": "error", "steps": steps, "error": f"find_main_content failed: {e}"}
    steps.append({
        "name": "find_main_content", "status": "success", "timingMs": _elapsed_ms(t0),
        "matchedSelector": matched_selector,
        "summary": f"Matched: {matched_selector}" if matched_selector else "Fell back to <body>.",
    })

    extracted_fields: dict[str, str] = {}
    if custom_extractors:
        t0 = time.perf_counter()
        llm_resolver = None
        if any(str(e.get("type") or "").lower() == "llm" for e in custom_extractors):
            llm_cfg = load_llm_config_from_db()
            domain = urlparse(url).netloc if url else ""
            llm_resolver = make_llm_resolver(domain=domain, crawl_run_id=None, llm_cfg=llm_cfg)
        try:
            from ...crawl.extraction import run_extractors

            extracted_fields = run_extractors(html_text, custom_extractors, llm_resolver=llm_resolver)
            steps.append({
                "name": "extract_structured_data", "status": "success", "timingMs": _elapsed_ms(t0),
                "summary": f"Extracted {len(extracted_fields)} field(s).",
                "output": extracted_fields,
            })
        except Exception as e:
            steps.append({
                "name": "extract_structured_data", "status": "error", "timingMs": _elapsed_ms(t0), "error": str(e),
            })
    else:
        steps.append({"name": "extract_structured_data", "status": "skipped", "timingMs": 0})

    t0 = time.perf_counter()
    try:
        markdown = html_to_markdown(root)
        body_text = extract_text(root)
        words = tokenize_words(body_text)
        word_count = count_words(words)
        reading_level = flesch_kincaid_grade(words, body_text)
        top_keywords = top_keywords_json(words)
    except Exception as e:
        steps.append({"name": "convert_markdown", "status": "error", "timingMs": _elapsed_ms(t0), "error": str(e)})
        return {"status": "error", "steps": steps, "error": f"convert_markdown failed: {e}"}
    steps.append({
        "name": "convert_markdown", "status": "success", "timingMs": _elapsed_ms(t0),
        "summary": f"{word_count} words.",
    })

    try:
        parsed_keywords = json.loads(top_keywords)
    except (TypeError, json.JSONDecodeError):
        parsed_keywords = []

    return {
        "status": "success",
        "steps": steps,
        "finalMarkdown": markdown,
        "finalMetrics": {
            "wordCount": word_count,
            "readingLevel": reading_level,
            "topKeywords": parsed_keywords,
        },
    }
