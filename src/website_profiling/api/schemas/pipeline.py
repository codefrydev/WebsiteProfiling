"""Pipeline job and config Pydantic schemas."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

# ── Config field type registry (mirrors pipelineConfigSchema.ts) ─────────────

# bool fields — coerce to Python bool
_BOOL_KEYS: frozenset[str] = frozenset({
    "run_crawl", "run_report", "run_keywords", "run_lighthouse", "run_plot",
    "run_security", "run_enrich", "run_google", "run_page_markdown",
    "ignore_robots", "allow_external", "store_outlinks", "store_content_excerpt",
    "store_page_html", "run_content_analysis", "probe_image_inventory",
    "compare_mobile_desktop", "lighthouse_run_mobile", "enable_ner",
    "enable_rich_results_validation", "ner_only_top_pages",
    "enable_hreflang_validation", "enable_crux_summary",
    "enable_executive_summary", "enable_google_keyword_planner",
    "enable_competitor_keywords", "export_csv", "export_json", "export_html",
    "export_pdf", "enable_bing_backlinks",
})

# tristate fields — 'auto' | 'true' | 'false'
_TRISTATE_KEYS: frozenset[str] = frozenset({
    "crawl_render_mode_tristate",
})

# Keys written internally by the server (not shown in UI)
INTERNAL_PIPELINE_KEYS: frozenset[str] = frozenset({"active_property_id"})

ALLOWED_COMMANDS: frozenset[str | None] = frozenset({
    None, "", "crawl", "report", "plot", "lighthouse", "keywords",
    "keywords --enrich-google", "warnings", "enrich", "google", "page-markdown",
})


def coerce_pipeline_state(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce raw state values to correct Python types, mirroring run/route.ts logic."""
    out: dict[str, Any] = {}
    for key, val in raw.items():
        if key.startswith("llm_"):
            continue
        if key in _BOOL_KEYS:
            out[key] = val is True or val == "true"
        elif key in _TRISTATE_KEYS:
            s = str(val or "auto").lower()
            out[key] = "true" if s == "true" else "false" if s == "false" else "auto"
        else:
            out[key] = "" if val is None else str(val)
    return out


def coerce_llm_state(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce LLM config state, mirroring run/route.ts llm coercion."""
    # LLM fields that are booleans
    _LLM_BOOL_KEYS = frozenset({
        "llm_chat_unlimited_tool_rounds",
        "llm_reasoning_enabled",
    })
    out: dict[str, Any] = {}
    for key, val in raw.items():
        if key.endswith("_masked"):
            continue
        if key in _LLM_BOOL_KEYS:
            out[key] = val is True or val == "true"
        else:
            out[key] = "" if val is None else str(val)
        # preserve _masked flags
        if raw.get(f"{key}_masked") is True:
            out[f"{key}_masked"] = True
    return out


def validate_pipeline_run(state: dict[str, Any], command: str | None) -> list[str]:
    """Return validation error messages (empty list = OK)."""
    errors: list[str] = []
    start_url = str(state.get("start_url") or "").strip()

    def needs_start_url() -> bool:
        if command == "crawl":
            return True
        if command in ("report", "keywords"):
            return True
        if command is None:
            run_crawl = state.get("run_crawl", True)
            run_report = state.get("run_report", True)
            if isinstance(run_crawl, str):
                run_crawl = run_crawl.lower() == "true"
            if isinstance(run_report, str):
                run_report = run_report.lower() == "true"
            return bool(run_crawl) or bool(run_report)
        return False

    if needs_start_url() and not start_url:
        errors.append("Site URL is required. Enter it in Audit settings before continuing.")
    return errors


# ── Request / response models ─────────────────────────────────────────────────

class UnknownKeyEntry(BaseModel):
    key: str
    value: str


class RunPostBody(BaseModel):
    command: Optional[str] = None
    state: Optional[dict[str, Any]] = None
    unknownKeys: list[UnknownKeyEntry] = Field(default_factory=list)
    llmState: Optional[dict[str, Any]] = None
    propertyId: Optional[int] = None
    python: Optional[str] = None
    repoRoot: Optional[str] = None


class RunResponse(BaseModel):
    jobId: str


class JobResponse(BaseModel):
    id: str
    jobType: str
    status: str
    exitCode: Optional[int] = None
    log: str = ""
    error: Optional[str] = None
    logTruncated: bool = False
    propertyId: Optional[int] = None
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None
    command: Optional[str] = None


class JobsListResponse(BaseModel):
    jobs: list[dict[str, Any]]
    active: Optional[dict[str, Any]] = None
    reconciled: int = 0


class CancelResponse(BaseModel):
    ok: bool
    status: str
    error: Optional[str] = None


class PauseResponse(BaseModel):
    ok: bool
    error: Optional[str] = None


class ResumeResponse(BaseModel):
    ok: bool
    newJobId: Optional[str] = None
    error: Optional[str] = None
