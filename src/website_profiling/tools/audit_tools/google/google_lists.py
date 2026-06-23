"""Google Search Console and GA4 list/delta tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....integrations.google.keyword_enrich import ctr_as_fraction, industry_ctr
from ....integrations.google.normalize import normalize_url, url_to_path
from .._slice import cap_list, parse_limit
from ..context import AuditToolContext
from ..insight.insight_helpers import blend_landing_pages, provenance_block, traffic_health_ratio, _num


def _gsc_ga4_blobs(raw: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    gsc = raw.get("gsc_full") if isinstance(raw.get("gsc_full"), dict) else raw.get("gsc") or {}
    ga4 = raw.get("ga4_full") if isinstance(raw.get("ga4_full"), dict) else raw.get("ga4") or {}
    return gsc if isinstance(gsc, dict) else {}, ga4 if isinstance(ga4, dict) else {}


def _load_google_pair(ctx: AuditToolContext, conn: Connection) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Current + prior Google snapshots (read_prior_google_snapshot, else 2nd google_data row)."""
    current, prior = ctx.load_google_pair(conn)
    if prior is not None or ctx.property_id is None:
        return current, prior
    try:
        from ....integrations.google.store import read_prior_google_snapshot

        prior = read_prior_google_snapshot(conn, ctx.property_id, skip=1)
    except Exception:
        prior = None
    if prior is None:
        try:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC LIMIT 2
                """,
                (int(ctx.property_id),),
            )
            rows = cur.fetchall() or []
            if len(rows) >= 2:
                from ....db.storage import _parse_row_json

                prior_data = _parse_row_json(rows[1])
                prior = prior_data if isinstance(prior_data, dict) else None
        except Exception:
            prior = None
    return current, prior


def _gsc_rows(data: dict[str, Any] | None, key: str) -> list[dict[str, Any]]:
    if not data:
        return []
    gsc, _ = _gsc_ga4_blobs(data)
    rows = gsc.get(key) or gsc.get(f"top_{key}") or []
    if isinstance(rows, list):
        return [r for r in rows if isinstance(r, dict)]
    return []


def _sort_gsc_rows(rows: list[dict[str, Any]], field: str, limit: int) -> dict[str, Any]:
    sorted_rows = sorted(rows, key=lambda r: -_num(r.get(field)))
    sliced = cap_list(sorted_rows, limit, max_cap=50)
    return {"items": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_gsc_pages_by_impressions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    result = _sort_gsc_rows(_gsc_rows(data, "pages"), "impressions", limit)
    return {"pages": result["items"], "total": result["total"], "truncated": result["truncated"]}


def list_gsc_pages_by_clicks(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    result = _sort_gsc_rows(_gsc_rows(data, "pages"), "clicks", limit)
    return {"pages": result["items"], "total": result["total"], "truncated": result["truncated"]}


def list_gsc_queries_by_impressions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    result = _sort_gsc_rows(_gsc_rows(data, "queries"), "impressions", limit)
    return {"queries": result["items"], "total": result["total"], "truncated": result["truncated"]}


def list_gsc_queries_by_clicks(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    result = _sort_gsc_rows(_gsc_rows(data, "queries"), "clicks", limit)
    return {"queries": result["items"], "total": result["total"], "truncated": result["truncated"]}


def list_gsc_ctr_underperformers(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    pages = _gsc_rows(data, "pages")
    ctrs = [ctr_as_fraction(r.get("ctr")) for r in pages if 1 <= _num(r.get("position"), 99) <= 10]
    ctrs = [c for c in ctrs if c > 0]
    site_median = sorted(ctrs)[len(ctrs) // 2] if ctrs else 0.05
    under: list[dict[str, Any]] = []
    for row in pages:
        pos = _num(row.get("position"), 99)
        if pos < 1 or pos > 10:
            continue
        ctr = ctr_as_fraction(row.get("ctr"))
        expected = industry_ctr(pos)
        if ctr > 0 and ctr < min(site_median * 0.7, expected * 0.7):
            under.append({
                "page": row.get("page"),
                "clicks": row.get("clicks"),
                "impressions": row.get("impressions"),
                "ctr": row.get("ctr"),
                "position": pos,
                "site_median_ctr": round(site_median, 4),
            })
    under.sort(key=lambda r: -_num(r.get("impressions")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(under, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _index_gsc_rows(rows: list[dict[str, Any]], key_fields: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = ""
        for field in key_fields:
            key = str(row.get(field) or "").strip()
            if key:
                break
        if key:
            out[key] = row
    return out


def _gsc_deltas(
    current_rows: list[dict[str, Any]],
    prior_rows: list[dict[str, Any]],
    key_fields: tuple[str, ...],
    *,
    decay: bool = True,
) -> list[dict[str, Any]]:
    curr = _index_gsc_rows(current_rows, key_fields)
    prev = _index_gsc_rows(prior_rows, key_fields)
    deltas: list[dict[str, Any]] = []
    for key, row in curr.items():
        old = prev.get(key)
        if not old:
            continue
        click_delta = _num(row.get("clicks")) - _num(old.get("clicks"))
        imp_delta = _num(row.get("impressions")) - _num(old.get("impressions"))
        pos_delta = _num(row.get("position")) - _num(old.get("position"))
        if decay:
            if click_delta >= 0 and imp_delta >= 0 and pos_delta <= 0:
                continue
        else:
            if click_delta <= 0 and imp_delta <= 0:
                continue
        entry = dict(row)
        entry["key"] = key
        entry["click_delta"] = int(click_delta)
        entry["impression_delta"] = int(imp_delta)
        entry["position_delta"] = round(pos_delta, 2)
        deltas.append(entry)
    deltas.sort(key=lambda r: (r.get("click_delta", 0), r.get("impression_delta", 0)))
    return deltas


def list_gsc_decaying_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    current, prior = _load_google_pair(scoped, conn)
    if not current:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    if not prior:
        return {"error": "no prior google snapshot for decay comparison", "missing": True, "pages": [], "total": 0, "truncated": False}
    deltas = _gsc_deltas(_gsc_rows(current, "pages"), _gsc_rows(prior, "pages"), ("page", "url"), decay=True)
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(deltas, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_gsc_decaying_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    current, prior = _load_google_pair(scoped, conn)
    if not current:
        return {"error": "no google data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    if not prior:
        return {"error": "no prior google snapshot for decay comparison", "missing": True, "queries": [], "total": 0, "truncated": False}
    deltas = _gsc_deltas(_gsc_rows(current, "queries"), _gsc_rows(prior, "queries"), ("query",), decay=True)
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(deltas, limit, max_cap=50)
    return {"queries": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_gsc_new_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    current, prior = _load_google_pair(scoped, conn)
    if not current:
        return {"error": "no google data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    if not prior:
        return {"error": "no prior google snapshot", "missing": True, "queries": [], "total": 0, "truncated": False}
    curr = _index_gsc_rows(_gsc_rows(current, "queries"), ("query",))
    prev = _index_gsc_rows(_gsc_rows(prior, "queries"), ("query",))
    new_rows = [row for key, row in curr.items() if key not in prev]
    new_rows.sort(key=lambda r: -_num(r.get("impressions")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(new_rows, limit, max_cap=50)
    return {"queries": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_ga4_landing_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    _, ga4 = _gsc_ga4_blobs(data)
    pages = ga4.get("top_pages") or []
    if not pages and isinstance(ga4.get("by_path"), dict):
        pages = [{"path": k, **v} for k, v in ga4["by_path"].items() if isinstance(v, dict)]
    if not isinstance(pages, list):
        pages = []
    pages = sorted([p for p in pages if isinstance(p, dict)], key=lambda r: -_num(r.get("sessions")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_ga4_pages_by_bounce_rate(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    _, ga4 = _gsc_ga4_blobs(data)
    pages = list(ga4.get("top_pages") or [])
    if not pages and isinstance(ga4.get("by_path"), dict):
        pages = [{"path": k, **v} for k, v in ga4["by_path"].items() if isinstance(v, dict)]
    pages = [p for p in pages if isinstance(p, dict) and p.get("bounceRate") is not None]
    pages.sort(key=lambda r: -_num(r.get("bounceRate")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_ga4_pages_by_engagement_rate(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    _, ga4 = _gsc_ga4_blobs(data)
    pages = list(ga4.get("top_pages") or [])
    if not pages and isinstance(ga4.get("by_path"), dict):
        pages = [{"path": k, **v} for k, v in ga4["by_path"].items() if isinstance(v, dict)]
    pages = [p for p in pages if isinstance(p, dict) and p.get("engagementRate") is not None]
    pages.sort(key=lambda r: -_num(r.get("engagementRate")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _daily_series(data: dict[str, Any] | None, section: str, match_key: str, match_val: str) -> list[dict[str, Any]]:
    if not data:
        return []
    block = data.get(section) if isinstance(data.get(section), dict) else {}
    daily = block.get("daily") or []
    if not isinstance(daily, list):
        return []
    needle = match_val.strip().lower()
    out: list[dict[str, Any]] = []
    for row in daily:
        if not isinstance(row, dict):
            continue
        for field in ("query", "page", "path", "url"):
            if field in row and str(row.get(field) or "").strip().lower() == needle:
                out.append(row)
                break
        else:
            dims = row.get("dimensions") if isinstance(row.get("dimensions"), dict) else {}
            if any(str(dims.get(k) or "").strip().lower() == needle for k in dims):
                out.append(row)
    return out


def get_gsc_query_trend(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    query = str(args.get("query") or "").strip()
    if not query:
        return {"error": "query is required"}
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True}
    series = _daily_series(data, "gsc", "query", query)
    if not series:
        gsc, _ = _gsc_ga4_blobs(data)
        for row in gsc.get("queries") or []:
            if isinstance(row, dict) and str(row.get("query") or "").lower() == query.lower():
                return {"query": query, "snapshot": row, "daily": [], "missing": True, "note": "daily series not stored"}
    return {"query": query, "daily": series, "fetched_at": data.get("fetched_at")}


def get_gsc_page_trend(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or args.get("page") or "").strip()
    if not url:
        return {"error": "url is required"}
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True}
    series = _daily_series(data, "gsc", "page", url)
    norm = normalize_url(url)
    if not series:
        series = _daily_series(data, "gsc", "page", norm)
    return {"url": url, "daily": series, "fetched_at": data.get("fetched_at"), "missing": not bool(series)}


def get_ga4_path_trend(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    path = str(args.get("path") or args.get("url") or "").strip()
    if not path:
        return {"error": "path is required"}
    if path.startswith(("http://", "https://")):
        path = url_to_path(path)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True}
    series = _daily_series(data, "ga4", "path", path)
    return {"path": path, "daily": series, "fetched_at": data.get("fetched_at"), "missing": not bool(series)}


def list_gsc_ga4_mismatch_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    gsc, ga4 = _gsc_ga4_blobs(data)
    by_page = gsc.get("by_page") if isinstance(gsc.get("by_page"), dict) else {}
    by_path = ga4.get("by_path") if isinstance(ga4.get("by_path"), dict) else {}
    if not by_page and gsc.get("pages"):
        by_page = {str(r.get("page")): r for r in (gsc.get("pages") or []) if isinstance(r, dict) and r.get("page")}
    rows = blend_landing_pages(by_page, by_path, limit=200, min_impressions=0)
    mismatches: list[dict[str, Any]] = []
    for row in rows:
        clicks = _num(row.get("gsc_clicks"))
        sessions = _num(row.get("ga4_sessions"))
        if clicks >= 10 and sessions == 0:
            mismatches.append({**row, "mismatch": "gsc_clicks_no_ga4_sessions"})
        elif sessions >= 10 and clicks == 0:
            mismatches.append({**row, "mismatch": "ga4_sessions_no_gsc_clicks"})
        elif clicks > 0 and sessions / clicks > 3:
            mismatches.append({**row, "mismatch": "ga4_sessions_high_vs_clicks"})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(mismatches, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": provenance_block(["gsc", "ga4"], data.get("fetched_at")),
    }


def list_gsc_pages_by_position_band(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True, "pages": [], "total": 0, "truncated": False}
    try:
        min_pos = float(args.get("min_position") or 1)
        max_pos = float(args.get("max_position") or 20)
    except (TypeError, ValueError):
        min_pos, max_pos = 1.0, 20.0
    pages = [
        r for r in _gsc_rows(data, "pages")
        if min_pos <= _num(r.get("position"), 99) <= max_pos
    ]
    pages.sort(key=lambda r: _num(r.get("position")))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_gsc_site_benchmarks(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "missing": True}
    gsc, ga4 = _gsc_ga4_blobs(data)
    pages = _gsc_rows(data, "pages")
    ctrs = [ctr_as_fraction(r.get("ctr")) for r in pages if _num(r.get("impressions")) > 0]
    positions = [_num(r.get("position")) for r in pages if _num(r.get("position")) > 0]
    ctrs.sort()
    positions.sort()
    return {
        "median_ctr": round(ctrs[len(ctrs) // 2], 4) if ctrs else None,
        "median_position": round(positions[len(positions) // 2], 2) if positions else None,
        "page_count": len(pages),
        "gsc_summary": gsc.get("summary") if isinstance(gsc.get("summary"), dict) else {},
        "ga4_summary": ga4.get("summary") if isinstance(ga4.get("summary"), dict) else {},
        "fetched_at": data.get("fetched_at"),
    }


def list_gsc_branded_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    branded = [r for r in (data.get("rows") or []) if isinstance(r, dict) and r.get("is_branded")]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(branded, limit, max_cap=50)
    return {"queries": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_gsc_non_branded_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "missing": True, "queries": [], "total": 0, "truncated": False}
    non_branded = [r for r in (data.get("rows") or []) if isinstance(r, dict) and not r.get("is_branded")]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(non_branded, limit, max_cap=50)
    return {"queries": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def compare_gsc_periods(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    current, prior = _load_google_pair(scoped, conn)
    if not current:
        return {"error": "no google data found", "missing": True}
    if not prior:
        return {"error": "no prior google snapshot for period comparison", "missing": True}
    gsc_curr, ga4_curr = _gsc_ga4_blobs(current)
    gsc_prev, ga4_prev = _gsc_ga4_blobs(prior)
    curr_summary = gsc_curr.get("summary") if isinstance(gsc_curr.get("summary"), dict) else {}
    prev_summary = gsc_prev.get("summary") if isinstance(gsc_prev.get("summary"), dict) else {}
    ga4_curr_summary = ga4_curr.get("summary") if isinstance(ga4_curr.get("summary"), dict) else {}
    ga4_prev_summary = ga4_prev.get("summary") if isinstance(ga4_prev.get("summary"), dict) else {}

    def _delta(key: str, cur: dict[str, Any], prev_d: dict[str, Any]) -> dict[str, Any]:
        c = _num(cur.get(key))
        p = _num(prev_d.get(key))
        return {"current": c, "prior": p, "delta": round(c - p, 2)}

    return {
        "gsc": {
            "clicks": _delta("clicks", curr_summary, prev_summary),
            "impressions": _delta("impressions", curr_summary, prev_summary),
            "ctr": _delta("ctr", curr_summary, prev_summary),
            "position": _delta("position", curr_summary, prev_summary),
        },
        "ga4": {
            "sessions": _delta("sessions", ga4_curr_summary, ga4_prev_summary),
            "users": _delta("users", ga4_curr_summary, ga4_prev_summary),
        },
        "traffic_health": traffic_health_ratio(curr_summary, ga4_curr_summary),
        "current_fetched_at": current.get("fetched_at"),
        "prior_fetched_at": prior.get("fetched_at"),
        "provenance": provenance_block(["gsc", "ga4"], current.get("fetched_at")),
    }
