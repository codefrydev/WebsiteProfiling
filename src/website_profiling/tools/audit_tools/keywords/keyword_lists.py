"""Keyword list and delta audit tools."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable

from psycopg import Connection

from ....integrations.google.keyword_enrich import opportunity_clicks
from ....integrations.google.keyword_store import read_keyword_snapshots_for_property
from .._slice import cap_list, parse_limit
from ..context import AuditToolContext
from ..insight.insight_helpers import _num


def _require_property(ctx: AuditToolContext) -> dict[str, Any] | None:
    if ctx.property_id is None:
        return {"error": "property_id is required for keyword data", "missing": True}
    return None


def _load_keywords(scoped: AuditToolContext, conn: Connection) -> dict[str, Any] | None:
    return scoped.load_keywords(conn)


def _keyword_rows(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not data:
        return []
    rows = data.get("rows") or []
    return [r for r in rows if isinstance(r, dict)]


def _index_keywords(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("keyword") or row.get("normalized") or "").strip().lower()
        if key:
            out[key] = row
    return out


def _position(row: dict[str, Any]) -> float | None:
    raw = row.get("gsc_position")
    if raw is None:
        return None
    try:
        pos = float(raw)
    except (TypeError, ValueError):
        return None
    return pos if pos > 0 else None


def _load_keyword_pair(
    scoped: AuditToolContext,
    conn: Connection,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    current = _load_keywords(scoped, conn)
    snapshots = read_keyword_snapshots_for_property(conn, scoped.property_id, limit=2)
    prior: dict[str, Any] | None = None
    if len(snapshots) >= 2:
        prior = snapshots[1]
    elif len(snapshots) == 1 and current is None:
        current = snapshots[0]
    return current, prior


def _rank_delta_rows(
    current: dict[str, Any],
    prior: dict[str, Any],
    *,
    improved: bool,
) -> list[dict[str, Any]]:
    curr = _index_keywords(_keyword_rows(current))
    prev = _index_keywords(_keyword_rows(prior))
    deltas: list[dict[str, Any]] = []
    for key, row in curr.items():
        old = prev.get(key)
        if not old:
            continue
        cur_pos = _position(row)
        old_pos = _position(old)
        if cur_pos is None or old_pos is None:
            continue
        pos_delta = cur_pos - old_pos
        if improved:
            if pos_delta >= 0:
                continue
        elif pos_delta <= 0:
            continue
        entry = {
            "keyword": row.get("keyword") or key,
            "gsc_position": cur_pos,
            "prior_position": old_pos,
            "position_delta": round(pos_delta, 2),
            "gsc_clicks": row.get("gsc_clicks"),
            "gsc_impressions": row.get("gsc_impressions"),
            "gsc_url": row.get("gsc_url"),
        }
        deltas.append(entry)
    deltas.sort(key=lambda r: r.get("position_delta", 0), reverse=not improved)
    return deltas


def _top_ten_transitions(
    current: dict[str, Any],
    prior: dict[str, Any],
    *,
    entered: bool,
) -> list[dict[str, Any]]:
    curr = _index_keywords(_keyword_rows(current))
    prev = _index_keywords(_keyword_rows(prior))
    rows: list[dict[str, Any]] = []
    if entered:
        for key, row in curr.items():
            cur_pos = _position(row)
            if cur_pos is None or cur_pos > 10:
                continue
            old_pos = _position(prev.get(key, {}))
            if old_pos is not None and old_pos <= 10:
                continue
            rows.append({
                "keyword": row.get("keyword") or key,
                "gsc_position": cur_pos,
                "prior_position": old_pos,
                "gsc_clicks": row.get("gsc_clicks"),
                "gsc_impressions": row.get("gsc_impressions"),
            })
    else:
        for key, old in prev.items():
            old_pos = _position(old)
            if old_pos is None or old_pos > 10:
                continue
            row = curr.get(key, {})
            cur_pos = _position(row)
            if cur_pos is not None and cur_pos <= 10:
                continue
            rows.append({
                "keyword": old.get("keyword") or key,
                "prior_position": old_pos,
                "gsc_position": cur_pos,
                "gsc_clicks": row.get("gsc_clicks") if row else old.get("gsc_clicks"),
                "gsc_impressions": row.get("gsc_impressions") if row else old.get("gsc_impressions"),
            })
    rows.sort(key=lambda r: -_num(r.get("gsc_impressions")))
    return rows


def _keyword_bucket(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    *,
    key: str,
    item_key: str,
    empty_error: str | None = None,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return {**err, item_key: [], "total": 0, "truncated": False}
    data = _load_keywords(scoped, conn)
    if not data:
        return {"error": empty_error or "no keyword data found", "missing": True, item_key: [], "total": 0, "truncated": False}
    items = data.get(key) or []
    if key == "semantic_keyword_clusters":
        payload = scoped.load_payload(conn)
        items = payload.get("semantic_keyword_clusters") or items
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(items if isinstance(items, list) else [], limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _filter_keywords(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    predicate: Callable[[dict[str, Any]], bool],
    *,
    sort_key: Callable[[dict[str, Any]], Any] | None = None,
    reverse: bool = True,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return {**err, "keywords": [], "total": 0, "truncated": False}
    data = _load_keywords(scoped, conn)
    if not data:
        return {"error": "no keyword data found", "missing": True, "keywords": [], "total": 0, "truncated": False}
    matches = [r for r in _keyword_rows(data) if predicate(r)]
    if sort_key:
        matches.sort(key=sort_key, reverse=reverse)
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(matches, limit, max_cap=50)
    return {"keywords": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _pair_delta_tool(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    *,
    builder: Callable[[dict[str, Any], dict[str, Any]], list[dict[str, Any]]],
    item_key: str,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return {**err, item_key: [], "total": 0, "truncated": False}
    current, prior = _load_keyword_pair(scoped, conn)
    if not current:
        return {"error": "no keyword data found", "missing": True, item_key: [], "total": 0, "truncated": False}
    if not prior:
        return {"error": "no prior keyword snapshot for comparison", "missing": True, item_key: [], "total": 0, "truncated": False}
    rows = builder(current, prior)
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(rows, limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def _serp_features(row: dict[str, Any]) -> list[str]:
    raw = row.get("serp_features")
    if isinstance(raw, list):
        return [str(f).lower() for f in raw if f]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip().lower()]
    return []


def _has_serp_feature(row: dict[str, Any], *needles: str) -> bool:
    features = _serp_features(row)
    return any(any(n in f for n in needles) for f in features)


def list_keyword_rank_improvements(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _pair_delta_tool(
        conn, ctx, args,
        builder=lambda cur, prev: _rank_delta_rows(cur, prev, improved=True),
        item_key="keywords",
    )


def list_keyword_rank_declines(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _pair_delta_tool(
        conn, ctx, args,
        builder=lambda cur, prev: _rank_delta_rows(cur, prev, improved=False),
        item_key="keywords",
    )


def list_keywords_new_to_top_10(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _pair_delta_tool(
        conn, ctx, args,
        builder=lambda cur, prev: _top_ten_transitions(cur, prev, entered=True),
        item_key="keywords",
    )


def list_keywords_fell_out_of_top_10(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _pair_delta_tool(
        conn, ctx, args,
        builder=lambda cur, prev: _top_ten_transitions(cur, prev, entered=False),
        item_key="keywords",
    )


def list_cannibalisation_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _keyword_bucket(conn, ctx, args, key="cannibalisation", item_key="queries")


def list_cannibalisation_urls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return {**err, "urls": [], "total": 0, "truncated": False}
    data = _load_keywords(scoped, conn)
    if not data:
        return {"error": "no keyword data found", "missing": True, "urls": [], "total": 0, "truncated": False}
    by_url: dict[str, dict[str, Any]] = {}
    for issue in data.get("cannibalisation") or []:
        if not isinstance(issue, dict):
            continue
        query = str(issue.get("query") or "")
        for page in issue.get("pages") or []:
            if not isinstance(page, dict):
                continue
            url = str(page.get("url") or "").strip()
            if not url:
                continue
            bucket = by_url.setdefault(url, {
                "url": url,
                "queries": [],
                "query_count": 0,
                "total_clicks": 0,
                "total_impressions": 0,
            })
            bucket["queries"].append({
                "query": query,
                "position": page.get("position"),
                "clicks": page.get("clicks"),
                "impressions": page.get("impressions"),
            })
            bucket["query_count"] += 1
            bucket["total_clicks"] += int(_num(page.get("clicks")))
            bucket["total_impressions"] += int(_num(page.get("impressions")))
    urls = sorted(by_url.values(), key=lambda r: (-r["query_count"], -r["total_impressions"]))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(urls, limit, max_cap=50)
    return {"urls": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_misaligned_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _keyword_bucket(
        conn, ctx, args,
        key="query_page_misalignment",
        item_key="misalignments",
    )


def list_keywords_by_recommended_action(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("recommended_action") or args.get("action") or "").strip().lower()
    if not action:
        return {"error": "recommended_action is required", "keywords": [], "total": 0, "truncated": False}
    return _filter_keywords(
        conn, ctx, args,
        lambda r: action in str(r.get("recommended_action") or "").lower(),
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def list_keywords_by_serp_feature(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    feature = str(args.get("serp_feature") or args.get("feature") or "").strip().lower()
    if not feature:
        return {"error": "serp_feature is required", "keywords": [], "total": 0, "truncated": False}
    return _filter_keywords(
        conn, ctx, args,
        lambda r: _has_serp_feature(r, feature),
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def _semantic_clusters(scoped: AuditToolContext, conn: Connection) -> list[dict[str, Any]]:
    payload = scoped.load_payload(conn)
    clusters = payload.get("semantic_keyword_clusters") if isinstance(payload, dict) else []
    if isinstance(clusters, list) and clusters:
        return [c for c in clusters if isinstance(c, dict)]
    data = _load_keywords(scoped, conn)
    if not data:
        return []
    fallback = data.get("semantic_keyword_clusters") or []
    return [c for c in fallback if isinstance(c, dict)] if isinstance(fallback, list) else []


def list_semantic_cluster_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    clusters = _semantic_clusters(scoped, conn)
    if not clusters:
        return {"missing": True, "clusters": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 20, 50)
    sliced = cap_list(clusters, limit, max_cap=50)
    return {"clusters": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_semantic_cluster_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return {**err, "clusters": [], "total": 0, "truncated": False}
    clusters = _semantic_clusters(scoped, conn)
    if not clusters:
        return {"missing": True, "clusters": [], "total": 0, "truncated": False}
    kw_to_url: dict[str, str] = {}
    for row in _keyword_rows(_load_keywords(scoped, conn)):
        kw = str(row.get("keyword") or "").strip().lower()
        url = str(row.get("gsc_url") or "").strip()
        if kw and url:
            kw_to_url[kw] = url
    enriched: list[dict[str, Any]] = []
    for cluster in clusters:
        keywords = [str(k).strip().lower() for k in (cluster.get("keywords") or []) if k]
        pages: dict[str, list[str]] = defaultdict(list)
        for kw in keywords:
            url = kw_to_url.get(kw)
            if url:
                pages[url].append(kw)
        enriched.append({
            "top_keyword": cluster.get("top_keyword") or cluster.get("representative"),
            "cluster_score": cluster.get("cluster_score"),
            "keywords": cluster.get("keywords") or [],
            "pages": [
                {"url": url, "keywords": kws, "keyword_count": len(kws)}
                for url, kws in sorted(pages.items(), key=lambda x: -len(x[1]))
            ],
            "page_count": len(pages),
        })
    limit = parse_limit(args.get("limit"), 20, 50)
    sliced = cap_list(enriched, limit, max_cap=50)
    return {"clusters": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_keyword_opportunity_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return err
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return {"error": "keyword is required"}
    data = _load_keywords(scoped, conn)
    if not data:
        return {"error": "no keyword data found", "missing": True}
    needle = keyword.lower()
    row = next(
        (r for r in _keyword_rows(data) if str(r.get("keyword") or "").lower() == needle),
        None,
    )
    if not row:
        return {"error": "keyword not found", "keyword": keyword, "missing": True}
    pos = _position(row) or 0.0
    impressions = int(_num(row.get("gsc_impressions")))
    opp_clicks = row.get("opportunity_clicks")
    if opp_clicks is None and pos > 0:
        opp_clicks = opportunity_clicks(impressions, pos, target_pos=3)
    score = float(row.get("score") or 0)
    traffic_potential = int(_num(row.get("traffic_potential")))
    composite = round(
        min(100.0, (float(opp_clicks or 0) * 2) + (traffic_potential / 50.0) + score),
        2,
    )
    return {
        "keyword": row.get("keyword") or keyword,
        "opportunity_score": composite,
        "opportunity_clicks": opp_clicks,
        "traffic_potential": traffic_potential,
        "gsc_position": pos or None,
        "gsc_impressions": impressions,
        "gsc_clicks": row.get("gsc_clicks"),
        "recommended_action": row.get("recommended_action"),
        "fetched_at": data.get("fetched_at"),
    }


def list_keywords_near_page_one(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        min_pos = float(args.get("min_position") or 4)
        max_pos = float(args.get("max_position") or 20)
        min_impressions = int(args.get("min_impressions") or 50)
    except (TypeError, ValueError):
        return {"error": "min_position, max_position, and min_impressions must be numbers"}

    def _near(row: dict[str, Any]) -> bool:
        pos = _position(row)
        if pos is None:
            return False
        return min_pos <= pos <= max_pos and _num(row.get("gsc_impressions")) >= min_impressions

    return _filter_keywords(
        conn, ctx, args, _near,
        sort_key=lambda r: (_num(r.get("gsc_impressions")), -(_position(r) or 99)),
    )


def list_keywords_high_impression_zero_click(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    # A free-form impressions threshold, NOT a pagination limit: parse_limit would
    # clamp it to >= 1 and <= 1_000_000, silently rejecting an explicit 0 and
    # capping large thresholds. Parse directly and clamp only to >= 0.
    raw_min_impr = args.get("min_impressions")
    try:
        min_impressions = int(raw_min_impr) if raw_min_impr is not None else 100
    except (TypeError, ValueError):
        min_impressions = 100
    min_impressions = max(0, min_impressions)

    def _zero_click(row: dict[str, Any]) -> bool:
        return int(_num(row.get("gsc_clicks"))) == 0 and int(_num(row.get("gsc_impressions"))) >= min_impressions

    return _filter_keywords(
        conn, ctx, args, _zero_click,
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def list_keywords_by_competition_band(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    try:
        min_comp = float(args.get("min_competition") if args.get("min_competition") is not None else 0)
        max_comp = float(args.get("max_competition") if args.get("max_competition") is not None else 100)
    except (TypeError, ValueError):
        return {"error": "min_competition and max_competition must be numbers"}

    def _in_band(row: dict[str, Any]) -> bool:
        raw = row.get("serp_estimated_competition")
        if raw is None:
            return False
        try:
            val = float(raw)
        except (TypeError, ValueError):
            return False
        return min_comp <= val <= max_comp

    return _filter_keywords(
        conn, ctx, args, _in_band,
        sort_key=lambda r: float(r.get("serp_estimated_competition") or 0),
        reverse=False,
    )


def get_keyword_serp_snapshot(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    err = _require_property(scoped)
    if err:
        return err
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return {"error": "keyword is required"}
    data = _load_keywords(scoped, conn)
    if not data:
        return {"error": "no keyword data found", "missing": True}
    needle = keyword.lower()
    row = next(
        (r for r in _keyword_rows(data) if str(r.get("keyword") or "").lower() == needle),
        None,
    )
    if not row:
        return {"error": "keyword not found", "keyword": keyword, "missing": True}
    return {
        "keyword": row.get("keyword") or keyword,
        "serp_features": row.get("serp_features"),
        "serp_estimated_competition": row.get("serp_estimated_competition"),
        "serp_organic_count": row.get("serp_organic_count"),
        "serp_provenance": row.get("serp_provenance") or "Estimated",
        "gsc_position": row.get("gsc_position"),
        "gsc_impressions": row.get("gsc_impressions"),
        "fetched_at": data.get("fetched_at"),
    }


def list_keywords_with_ai_overview(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _filter_keywords(
        conn, ctx, args,
        lambda r: _has_serp_feature(r, "ai_overview", "answer_box", "featured_snippet", "knowledge_graph"),
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def list_keywords_local_pack(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _filter_keywords(
        conn, ctx, args,
        lambda r: _has_serp_feature(r, "local_pack", "local", "map"),
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def list_keywords_question_intent(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _filter_keywords(
        conn, ctx, args,
        lambda r: bool(r.get("is_question")),
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )


def list_keywords_commercial_intent(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    commercial = {"commercial", "transactional"}
    return _filter_keywords(
        conn, ctx, args,
        lambda r: str(r.get("intent") or "").lower() in commercial,
        sort_key=lambda r: _num(r.get("gsc_impressions")),
    )
