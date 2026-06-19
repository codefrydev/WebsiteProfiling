"""Chat-only crawl action tools (preview; user confirms in UI before run)."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from psycopg import Connection

from ...crawl_presets import (
    CRAWL_PRESET_PATCHES,
    DEFAULT_CRAWL_PRESET_ID,
    apply_crawl_preset,
)
from ...db.config_store import read_pipeline_config
from ...db.property_store import (
    canonical_domain_from_start_url,
    derive_property_name,
    get_property_by_id,
)
from ...llm_config import load_llm_config_from_db
from .context import AuditToolContext

CHAT_CRAWL_TOOL = "prepare_audit_run"

_VALID_PRESETS = frozenset(CRAWL_PRESET_PATCHES.keys())
_VALID_PIPELINE_MODES = frozenset({"full-audit", "crawl-only"})
_VALID_RENDER_MODES = frozenset({"static", "auto", "javascript"})
_OVERRIDE_KEYS = frozenset({
    "max_pages",
    "crawl_render_mode",
    "run_lighthouse_on_pages",
    "concurrency",
})

_PIPELINE_PATCHES: dict[str, dict[str, str]] = {
    "full-audit": {
        "run_crawl": "true",
        "run_report": "true",
        "run_plot": "true",
    },
    "crawl-only": {},
}


def _truthy_cfg(cfg: dict[str, str], key: str) -> bool:
    return str(cfg.get(key, "")).lower() in ("true", "1", "yes")


def _chat_allow_crawl(cfg: dict[str, str] | None = None) -> bool:
    if cfg is None:
        cfg = load_llm_config_from_db()
    return _truthy_cfg(cfg, "llm_chat_allow_crawl")


def _normalize_url(raw: str) -> str:
    trimmed = (raw or "").strip()
    if not trimmed:
        return ""
    if trimmed.startswith(("http://", "https://")):
        return trimmed
    return f"https://{trimmed}"


def _is_valid_url(raw: str) -> bool:
    normalized = _normalize_url(raw)
    if not normalized:
        return False
    try:
        parsed = urlparse(normalized)
        return bool(parsed.hostname)
    except Exception:
        return False


def _pipeline_job_running(conn: Connection) -> bool:
    try:
        cur = conn.execute(
            "SELECT 1 FROM pipeline_jobs WHERE status = 'running' LIMIT 1",
        )
        return cur.fetchone() is not None
    except Exception:
        return False


def _resolve_crawl_preset_id(
    args: dict[str, Any],
    mode: str,
    conn: Connection,
    ctx: AuditToolContext,
    existing_prop: dict[str, Any] | None,
) -> str:
    raw_preset = args.get("crawl_preset_id")
    if raw_preset is not None and str(raw_preset).strip():
        preset_id = str(raw_preset).strip().lower()
        return preset_id if preset_id in _VALID_PRESETS else DEFAULT_CRAWL_PRESET_ID

    if mode == "default":
        prop = existing_prop
        if prop is None and ctx.property_id is not None:
            prop = get_property_by_id(conn, int(ctx.property_id))
        if prop:
            preset_raw = str(prop.get("default_crawl_preset") or "").strip().lower()
            if preset_raw in _VALID_PRESETS:
                return preset_raw

    return DEFAULT_CRAWL_PRESET_ID


def _resolve_start_url(
    args: dict[str, Any],
    ctx: AuditToolContext,
    conn: Connection,
) -> tuple[str, dict[str, Any] | None]:
    """Return (start_url, property_row or None)."""
    create_prop = args.get("create_property")
    if isinstance(create_prop, dict):
        site = _normalize_url(str(create_prop.get("site_url") or args.get("start_url") or ""))
        return site, None

    explicit = _normalize_url(str(args.get("start_url") or ""))
    if explicit:
        return explicit, None

    pid = ctx.property_id
    if pid is not None:
        prop = get_property_by_id(conn, int(pid))
        if prop:
            site = _normalize_url(str(prop.get("site_url") or ""))
            if site:
                return site, prop
    return "", None


def _build_highlights(
    preset_id: str,
    pipeline_mode: str,
    overrides: dict[str, str],
) -> list[str]:
    lines: list[str] = []
    patch = CRAWL_PRESET_PATCHES.get(preset_id, {})
    max_pages = overrides.get("max_pages") or patch.get("max_pages", "")
    render = overrides.get("crawl_render_mode") or patch.get("crawl_render_mode", "static")
    if max_pages:
        lines.append(f"Up to {max_pages} pages")
    lines.append(f"Render mode: {render}")
    lines.append("Full audit" if pipeline_mode == "full-audit" else "Crawl only")
    lh = overrides.get("run_lighthouse_on_pages") or patch.get("run_lighthouse_on_pages")
    if lh is not None:
        lines.append(
            "Lighthouse on pages: yes" if str(lh).lower() in ("true", "1", "yes") else "Lighthouse on pages: no"
        )
    if overrides.get("concurrency"):
        lines.append(f"Concurrency: {overrides['concurrency']}")
    return lines


def prepare_audit_run(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
) -> dict[str, Any]:
    """Build a preview run spec for in-chat crawl confirmation (does not spawn a job)."""
    if not _chat_allow_crawl():
        return {"error": "Chat crawl actions are disabled in AI settings."}

    if _pipeline_job_running(conn):
        return {
            "ready": False,
            "job_running": True,
            "errors": ["An audit job is already running. Wait for it to finish or view it in Run audit."],
        }

    mode = str(args.get("mode") or "default").strip().lower()
    if mode not in ("default", "custom"):
        return {"ready": False, "errors": [f"Invalid mode: {mode!r}. Use 'default' or 'custom'."]}

    pipeline_mode = str(args.get("pipeline_mode") or "full-audit").strip().lower()
    if pipeline_mode not in _VALID_PIPELINE_MODES:
        return {
            "ready": False,
            "errors": [f"Invalid pipeline_mode: {pipeline_mode!r}. Use 'full-audit' or 'crawl-only'."],
        }

    start_url, existing_prop = _resolve_start_url(args, ctx, conn)
    preset_id = _resolve_crawl_preset_id(args, mode, conn, ctx, existing_prop)
    create_prop_payload: dict[str, Any] | None = None

    create_prop = args.get("create_property")
    if isinstance(create_prop, dict):
        site = _normalize_url(str(create_prop.get("site_url") or start_url))
        if not _is_valid_url(site):
            return {"ready": False, "errors": ["A valid site URL is required for a new property."]}
        domain = canonical_domain_from_start_url(site)
        if not domain:
            return {"ready": False, "errors": ["Could not derive domain from site URL."]}
        name = str(create_prop.get("name") or "").strip() or derive_property_name(domain, site)
        start_url = site
        create_prop_payload = {
            "name": name,
            "canonical_domain": domain,
            "site_url": site,
        }
    elif not _is_valid_url(start_url):
        return {
            "ready": False,
            "errors": ["Start URL is required. Provide start_url or select a property with site_url set."],
        }

    overrides: dict[str, str] = {}
    if mode == "custom":
        raw_overrides = args.get("config_overrides")
        if isinstance(raw_overrides, dict):
            for key, val in raw_overrides.items():
                k = str(key).strip()
                if k not in _OVERRIDE_KEYS:
                    continue
                if k == "crawl_render_mode":
                    v = str(val).strip().lower()
                    if v in _VALID_RENDER_MODES:
                        overrides[k] = v
                elif k in ("run_lighthouse_on_pages",):
                    overrides[k] = "true" if str(val).lower() in ("true", "1", "yes") else "false"
                else:
                    overrides[k] = str(val).strip()

    saved_cfg, _unknown = read_pipeline_config(conn)
    merged: dict[str, str] = dict(saved_cfg)
    merged["start_url"] = start_url

    property_id: int | None = None
    if existing_prop:
        property_id = int(existing_prop["id"])
        merged["active_property_id"] = str(property_id)
    elif ctx.property_id is not None and not create_prop_payload:
        property_id = int(ctx.property_id)
        merged["active_property_id"] = str(property_id)

    merged = apply_crawl_preset(preset_id, merged)
    merged.update(_PIPELINE_PATCHES.get(pipeline_mode, {}))
    merged.update(overrides)

    command = "crawl" if pipeline_mode == "crawl-only" else ""

    errors: list[str] = []
    discovery = str(merged.get("crawl_discovery_mode") or "spider").strip().lower()
    url_list = str(merged.get("crawl_url_list") or "").strip()
    if discovery == "list" and not url_list:
        errors.append("URL list is required when discovery mode is List (configure in Audit settings).")

    if errors:
        return {"ready": False, "errors": errors}

    highlights = _build_highlights(preset_id, pipeline_mode, overrides)

    run_spec: dict[str, Any] = {
        "command": command,
        "state": merged,
        "create_property": create_prop_payload,
    }

    return {
        "ready": True,
        "summary": {
            "start_url": start_url,
            "crawl_preset": preset_id,
            "pipeline_mode": pipeline_mode,
            "highlights": highlights,
        },
        "run_spec": run_spec,
    }
