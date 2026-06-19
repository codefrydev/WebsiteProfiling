"""AI-powered DashScript and widget/dashboard generation."""
from __future__ import annotations

import json
from typing import Any

from ..llm_config import llm_is_enabled
from .base import get_llm_client, parse_json_response
from .prompts import DASHBOARD_AI_SYSTEM

VALID_MODES = frozenset({"script", "widget", "dashboard"})


def _dashboard_ai_enabled(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_dashboards", "true")).lower()
    return v in ("true", "1", "yes")


def generate_dashboard_ai(
    payload: dict[str, Any],
    *,
    cfg: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Generate DashScript, a full widget, or a whole dashboard from a natural-language prompt.

    ``payload`` shape::

        {
            "mode":            "script" | "widget" | "dashboard",
            "prompt":          "<user natural-language request>",
            "catalog":         [ { toolName, label, fields, compatibleViz, ... } ],
            "viz_types":       { "bar": "Vertical bar chart", ... },
            "dashscript_help": "<grammar reference string>",
            "current":         { optional current widget binding/options },
            "sample":          { optional truncated tool result for the selected tool },
        }

    Return value varies by mode — validation happens in TypeScript.
    """
    from ..llm_config import load_llm_config_from_db

    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled.", "missing": True}
    if not _dashboard_ai_enabled(cfg):
        return {"ok": False, "error": "Dashboard AI is disabled in task settings.", "missing": True}

    mode = str(payload.get("mode") or "widget").strip().lower()
    if mode not in VALID_MODES:
        return {"ok": False, "error": f"Unknown mode: {mode!r}. Must be one of: script, widget, dashboard."}

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt is required."}

    try:
        client = get_llm_client(cfg)
        user = json.dumps(payload, indent=2, default=str)[:10_000]
        raw = client.complete_json(DASHBOARD_AI_SYSTEM, user)
        result = raw if isinstance(raw, dict) and raw else parse_json_response(str(raw))
        result["ok"] = True
        return result
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
