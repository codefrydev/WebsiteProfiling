"""On-demand LLM page coach for Link Explorer."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..llm_config import load_llm_config_from_db, llm_is_enabled
from .base import get_llm_client, parse_json_response
from .enrich import _read_cache, _write_cache
from .prompts import PAGE_COACH_SYSTEM, PROMPT_VERSION


def _find_link(links: list[dict], page_url: str) -> dict[str, Any] | None:
    from ..integrations.google.normalize import normalize_url

    norm = normalize_url(page_url)
    for rec in links:
        if not isinstance(rec, dict):
            continue
        if normalize_url(str(rec.get("url") or "")) == norm:
            return rec
    return None


def _keywords_for_page(page_url: str, property_id: int | None = None) -> dict[str, Any]:
    from ..db import db_session
    from ..integrations.google.keyword_store import read_latest_keyword_data

    norm = page_url.lower().rstrip("/")
    try:
        with db_session() as conn:
            if property_id is None:
                from ..commands.config_resolve import load_config_from_db, resolve_property_id_from_cfg

                cfg = load_config_from_db()
                property_id = resolve_property_id_from_cfg(cfg, conn)
            data = read_latest_keyword_data(conn, property_id)
            if not data:
                return {"keywords": [], "cannibalisation": []}
            rows = data.get("rows") if isinstance(data.get("rows"), list) else []
            page_kws = [
                r
                for r in rows
                if isinstance(r, dict)
                and norm in str(r.get("gsc_url") or "").lower().rstrip("/")
            ]
            cannib = []
            for c in data.get("cannibalisation") or []:
                if not isinstance(c, dict):
                    continue
                pages = c.get("pages") or []
                if any(
                    isinstance(p, dict) and norm in str(p.get("url") or "").lower().rstrip("/")
                    for p in pages
                ):
                    cannib.append(c)
            return {"keywords": page_kws[:40], "cannibalisation": cannib}
    except Exception:
        return {"keywords": [], "cannibalisation": []}


def build_page_context(
    page_url: str,
    *,
    current_type: str | None = None,
    current_id: int | None = None,
    baseline_type: str | None = None,
    baseline_id: int | None = None,
) -> dict[str, Any]:
    from ..db import db_session
    from ..db.storage import _parse_row_json, _row_field, read_report_payload
    from ..integrations.google.page_lookup import slice_from_google_row
    from ..integrations.google.page_snapshot_store import read_page_snapshot

    ctx: dict[str, Any] = {"page_url": page_url, "link": None, "current": None, "baseline": None, "compare": []}

    with db_session() as conn:
        report = read_report_payload(conn) or {}
        links = report.get("links") or []
        if isinstance(links, list):
            ctx["link"] = _find_link(links, page_url)

        if current_type == "live" and current_id:
            ctx["current"] = read_page_snapshot(conn, current_id)
        elif current_id:
            cur = conn.execute("SELECT data FROM google_data WHERE id = %s", (current_id,))
            row = cur.fetchone()
            if row:
                raw = _parse_row_json(row)
                if isinstance(raw, dict):
                    slice_data = slice_from_google_row(raw, page_url)
                    slice_data["snapshotId"] = current_id
                    ctx["current"] = slice_data
        else:
            from ..integrations.google.page_snapshot_store import latest_live_snapshot

            live = latest_live_snapshot(conn, page_url)
            if live:
                ctx["current"] = live
            else:
                cur = conn.execute("SELECT id, data FROM google_data ORDER BY id DESC LIMIT 1")
                row = cur.fetchone()
                if row:
                    raw = _parse_row_json(row)
                    if isinstance(raw, dict):
                        slice_data = slice_from_google_row(raw, page_url)
                        sid = _row_field(row, "id")
                        slice_data["snapshotId"] = int(sid) if sid is not None else None
                        ctx["current"] = slice_data

        if baseline_type == "live" and baseline_id:
            ctx["baseline"] = read_page_snapshot(conn, baseline_id)
        elif baseline_type == "snapshot" and baseline_id:
            cur = conn.execute("SELECT data FROM google_data WHERE id = %s", (baseline_id,))
            row = cur.fetchone()
            if row:
                raw = _parse_row_json(row)
                if isinstance(raw, dict):
                    ctx["baseline"] = slice_from_google_row(raw, page_url)

    ctx["keywords"] = _keywords_for_page(page_url)

    cur_g = ctx.get("current") or {}
    base_g = ctx.get("baseline") or {}
    if cur_g and base_g:
        ctx["compare"] = _metric_deltas(cur_g, base_g)

    return ctx


def _metric_deltas(current: dict, baseline: dict) -> list[dict[str, Any]]:
    rows = []
    pairs = [
        ("gsc_clicks", "gsc", "clicks", True),
        ("gsc_impressions", "gsc", "impressions", True),
        ("gsc_ctr", "gsc", "ctr", True),
        ("gsc_position", "gsc", "position", False),
        ("ga4_sessions", "ga4", "sessions", True),
        ("ga4_engagement", "ga4", "engagementRate", True),
    ]
    for mid, blob, key, higher in pairs:
        c = (current.get(blob) or {}).get(key)
        b = (baseline.get(blob) or {}).get(key)
        if c is None and b is None:
            continue
        try:
            c_f, b_f = float(c or 0), float(b or 0)
            delta = round(c_f - b_f, 2)
            rows.append({"id": mid, "current": c_f, "baseline": b_f, "delta": delta, "higher_is_better": higher})
        except (TypeError, ValueError):
            continue
    return rows


def run_page_coach(
    page_url: str,
    cfg: dict[str, str] | None = None,
    *,
    refresh: bool = False,
    current_type: str | None = None,
    current_id: int | None = None,
    baseline_type: str | None = None,
    baseline_id: int | None = None,
) -> dict[str, Any]:
    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled. Enable them in Pipeline → Content & AI."}

    if not _cfg_bool_page_coach(cfg):
        return {"ok": False, "error": "Page coach is disabled in AI task settings."}

    context = build_page_context(
        page_url,
        current_type=current_type,
        current_id=current_id,
        baseline_type=baseline_type,
        baseline_id=baseline_id,
    )

    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "unknown").strip()
    payload_str = json.dumps(context, sort_keys=True, default=str)
    cache_key = hashlib.sha256(
        f"page_coach:v2:{PROMPT_VERSION}:{model}:{page_url}:{payload_str}".encode()
    ).hexdigest()

    if not refresh:
        cached = _read_cache(cache_key)
        if cached:
            return {"ok": True, "cached": True, "coach": cached, "context": context}

    try:
        client = get_llm_client(cfg)
        user = json.dumps(context, indent=2, default=str)[:12000]
        raw = client.complete_json(PAGE_COACH_SYSTEM, user)
        if isinstance(raw, dict) and raw:
            coach = raw
        else:
            coach = parse_json_response(str(raw))
        if not coach:
            coach = {"summary": "No structured coach output returned."}
        _write_cache(cache_key, coach)
        return {"ok": True, "cached": False, "coach": coach, "context": context}
    except Exception as e:
        return {"ok": False, "error": str(e), "context": context}


def _cfg_bool_page_coach(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_page_coach", "true")).lower()
    return v in ("true", "1", "yes")
