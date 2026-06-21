"""Report payload comparison — parity with web reportCompare.ts / reportCompareExtras.ts."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..scoring import round_half_up

_PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
_LH_DELTA_THRESHOLD = 5
_ISSUE_DELTA_CAP = 100
_LINK_METRIC_CAP = 200

_SEO_HEALTH_FIELDS = [
    ("missing_title", "Missing title", False),
    ("title_ok", "Title OK", True),
    ("missing_meta_desc", "Missing meta description", False),
    ("meta_desc_ok", "Meta description OK", True),
    ("h1_zero", "Pages with no H1", False),
    ("h1_one", "Pages with one H1", True),
    ("h1_multi", "Pages with multiple H1s", False),
    ("thin_content", "Thin content (flagged)", False),
]


def norm_report_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        return ""
    try:
        p = urlparse(raw)
        path = (p.path or "/").rstrip("/") or "/"
        host = (p.hostname or "").lower()
        if not host:
            return raw.rstrip("/").lower()
        return f"{host}{path}"
    except Exception:
        return raw.rstrip("/").lower()


def _num(v: Any) -> float | None:
    try:
        n = float(v)
        return n if n == n else None  # NaN check
    except (TypeError, ValueError):
        return None


def _score_from_categories(categories: list[Any]) -> int | None:
    scores = [
        float(c.get("score"))
        for c in categories
        if isinstance(c, dict) and isinstance(c.get("score"), (int, float))
    ]
    return round_half_up(sum(scores) / len(scores)) if scores else None


def _issue_key(url: str, category: str, message: str) -> str:
    return f"{norm_report_url(url)}|{category}|{message[:120]}"


def _flatten_category_issues(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        category = str(cat.get("name") or cat.get("id") or "")
        for iss in cat.get("issues") or []:
            if not isinstance(iss, dict):
                continue
            url = str(iss.get("url") or "")
            message = str(iss.get("message") or iss.get("recommendation") or "").strip()
            if not url and not message:
                continue
            key = _issue_key(url, category, message)
            out[key] = {
                "kind": "new",
                "url": url or "—",
                "category": category,
                "priority": str(iss.get("priority") or "Medium"),
                "message": message or "—",
            }
    return out


def build_issue_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    cur = _flatten_category_issues(current)
    base = _flatten_category_issues(baseline)
    out: list[dict[str, Any]] = []
    for key, row in cur.items():
        if key not in base:
            out.append({**row, "kind": "new"})
    for key, row in base.items():
        if key not in cur:
            out.append({**row, "kind": "resolved"})
    out.sort(key=lambda x: (
        _PRIORITY_ORDER.get(x.get("priority", "Low"), 9),
        0 if x.get("kind") == "new" else 1,
        str(x.get("url") or ""),
    ))
    return out


def build_priority_counts(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    def count_map(payload: dict[str, Any]) -> dict[str, int]:
        counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for cat in payload.get("categories") or []:
            if not isinstance(cat, dict):
                continue
            for iss in cat.get("issues") or []:
                if not isinstance(iss, dict):
                    continue
                p = str(iss.get("priority") or "Medium")
                counts[p] = counts.get(p, 0) + 1
        return counts

    cur = count_map(current)
    base = count_map(baseline)
    return [
        {
            "priority": p,
            "current": cur.get(p, 0),
            "baseline": base.get(p, 0),
            "delta": cur.get(p, 0) - base.get(p, 0),
        }
        for p in ("Critical", "High", "Medium", "Low")
    ]


def _scale_lh_score(score_0_1: float | None, fallback_0_100: float | None) -> float | None:
    """Lighthouse ``median_metrics`` scores are stored on the native 0-1 scale, but
    the deltas/threshold (``_LH_DELTA_THRESHOLD`` = 5 points) operate on a 0-100
    scale, so scale them up. The ``fallback`` value (summary-level
    ``performance``/``seo``) is already on the 0-100 scale and is used as-is."""
    if score_0_1 is not None:
        return round(score_0_1 * 100)
    if fallback_0_100 is not None:
        return round(fallback_0_100)
    return None


def _lh_from_payload(payload: dict[str, Any]) -> dict[str, dict[str, float | None]]:
    out: dict[str, dict[str, float | None]] = {}
    by_url = payload.get("lighthouse_by_url")
    if isinstance(by_url, dict):
        for raw_url, summary in by_url.items():
            if not isinstance(summary, dict):
                continue
            k = norm_report_url(str(raw_url))
            if not k:
                continue
            metrics = summary.get("median_metrics") or summary
            out[k] = {
                "perf": _scale_lh_score(_num(metrics.get("performance_score")), _num(summary.get("performance"))),
                "seo": _scale_lh_score(_num(metrics.get("seo_score")), _num(summary.get("seo"))),
            }
    for link in payload.get("links") or []:
        if not isinstance(link, dict):
            continue
        k = norm_report_url(str(link.get("url") or ""))
        if not k or k in out:
            continue
        lh = link.get("lighthouse") if isinstance(link.get("lighthouse"), dict) else {}
        metrics = lh.get("median_metrics") or {}
        out[k] = {
            "perf": _scale_lh_score(_num(metrics.get("performance_score")), None),
            "seo": _scale_lh_score(_num(metrics.get("seo_score")), None),
        }
    return out


def build_lighthouse_url_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    cur = _lh_from_payload(current)
    base = _lh_from_payload(baseline)
    out: list[dict[str, Any]] = []
    for k, c in cur.items():
        b = base.get(k)
        if not b:
            continue
        perf_delta = (c["perf"] - b["perf"]) if c["perf"] is not None and b["perf"] is not None else None
        seo_delta = (c["seo"] - b["seo"]) if c["seo"] is not None and b["seo"] is not None else None
        if (
            (perf_delta is not None and abs(perf_delta) >= _LH_DELTA_THRESHOLD)
            or (seo_delta is not None and abs(seo_delta) >= _LH_DELTA_THRESHOLD)
        ):
            out.append({
                "url": k,
                "performance_current": c["perf"],
                "performance_baseline": b["perf"],
                "performance_delta": perf_delta,
                "seo_current": c["seo"],
                "seo_baseline": b["seo"],
                "seo_delta": seo_delta,
            })
    out.sort(key=lambda x: abs(x.get("performance_delta") or 0), reverse=True)
    return out


def build_link_metric_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    specs = [
        ("inlinks", "inlinks", 1),
        ("outlinks", "outlinks", 1),
        ("word_count", "word_count", 25),
        ("response_time_ms", "response_ms", 150),
    ]
    cur_map = {
        norm_report_url(str(l.get("url") or "")): l
        for l in (current.get("links") or [])
        if isinstance(l, dict) and norm_report_url(str(l.get("url") or ""))
    }
    out: list[dict[str, Any]] = []
    for bl in baseline.get("links") or []:
        if not isinstance(bl, dict):
            continue
        k = norm_report_url(str(bl.get("url") or ""))
        if not k:
            continue
        cl = cur_map.get(k)
        if not cl:
            continue
        for key, metric, min_delta in specs:
            c = _num(cl.get(key))
            b = _num(bl.get(key))
            if c is None or b is None:
                continue
            delta = round((c - b) * 10) / 10
            if abs(delta) >= min_delta:
                out.append({
                    "url": cl.get("url") or bl.get("url"),
                    "metric": metric,
                    "current": c,
                    "baseline": b,
                    "delta": delta,
                })
    out.sort(key=lambda x: abs(x.get("delta") or 0), reverse=True)
    # Return the full list; callers slice and report truncation accurately
    # (capping here hid the real total and produced a false "truncated" flag at
    # exactly the cap).
    return out


def _redirect_key(r: dict[str, Any]) -> str:
    return norm_report_url(str(r.get("url") or r.get("from") or ""))


def build_redirect_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    def to_map(lst: list[Any]) -> dict[str, dict[str, Any]]:
        m: dict[str, dict[str, Any]] = {}
        for r in lst:
            if not isinstance(r, dict):
                continue
            k = _redirect_key(r)
            if not k:
                continue
            m[k] = {
                "kind": "new",
                "url": str(r.get("url") or r.get("from") or k),
                "status": str(r.get("status") or "—"),
                "final_url": str(r.get("final_url") or r.get("to") or ""),
            }
        return m

    cur = to_map(current.get("redirects") or [])
    base = to_map(baseline.get("redirects") or [])
    out: list[dict[str, Any]] = []
    for k, row in cur.items():
        if k not in base:
            out.append({**row, "kind": "new"})
    for k, row in base.items():
        if k not in cur:
            out.append({**row, "kind": "removed"})
    out.sort(key=lambda x: str(x.get("url") or ""))
    return out


def _security_key(f: dict[str, Any]) -> str:
    return f"{norm_report_url(str(f.get('url') or ''))}|{f.get('finding_type')}|{str(f.get('message') or '')[:80]}"


def build_security_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    def to_map(lst: list[Any]) -> dict[str, dict[str, Any]]:
        m: dict[str, dict[str, Any]] = {}
        for f in lst:
            if not isinstance(f, dict):
                continue
            k = _security_key(f)
            m[k] = {
                "kind": "new",
                "url": str(f.get("url") or "—"),
                "severity": str(f.get("severity") or "—"),
                "finding_type": str(f.get("finding_type") or "—"),
                "message": str(f.get("message") or "—"),
            }
        return m

    cur = to_map(current.get("security_findings") or [])
    base = to_map(baseline.get("security_findings") or [])
    out: list[dict[str, Any]] = []
    for key, row in cur.items():
        if key not in base:
            out.append({**row, "kind": "new"})
    for key, row in base.items():
        if key not in cur:
            out.append({**row, "kind": "resolved"})
    return out


def build_duplicate_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    def to_map(lst: list[Any]) -> dict[str, dict[str, Any]]:
        m: dict[str, dict[str, Any]] = {}
        for c in lst:
            if not isinstance(c, dict):
                continue
            k = str(c.get("id") or c.get("representative_url") or "").strip()
            if not k:
                continue
            members = c.get("member_count")
            if members is None:
                members = len(c.get("member_urls") or [])
            m[k] = {"rep": c.get("representative_url") or k, "members": int(members or 0)}
        return m

    cur = to_map(current.get("content_duplicates") or [])
    base = to_map(baseline.get("content_duplicates") or [])
    out: list[dict[str, Any]] = []
    for cid, c in cur.items():
        b = base.get(cid)
        if not b:
            out.append({
                "kind": "new",
                "cluster_id": cid,
                "representative_url": c["rep"],
                "current_members": c["members"],
                "baseline_members": 0,
            })
        elif c["members"] != b["members"]:
            out.append({
                "kind": "changed",
                "cluster_id": cid,
                "representative_url": c["rep"],
                "current_members": c["members"],
                "baseline_members": b["members"],
            })
    for cid, b in base.items():
        if cid not in cur:
            out.append({
                "kind": "removed",
                "cluster_id": cid,
                "representative_url": b["rep"],
                "current_members": 0,
                "baseline_members": b["members"],
            })
    return out


def build_tech_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    def to_map(payload: dict[str, Any]) -> dict[str, int]:
        m: dict[str, int] = {}
        tech = payload.get("tech_stack_summary") or {}
        entries = tech.get("technologies") if isinstance(tech, dict) else []
        for t in entries or []:
            if not isinstance(t, dict):
                continue
            name = str(t.get("name") or t.get("tech") or "").strip()
            if name:
                m[name] = int(t.get("count") or 0)
        return m

    cur = to_map(current)
    base = to_map(baseline)
    out: list[dict[str, Any]] = []
    for name, count in cur.items():
        if name not in base:
            out.append({"kind": "added", "name": name, "current_count": count, "baseline_count": 0})
    for name, count in base.items():
        if name not in cur:
            out.append({"kind": "removed", "name": name, "current_count": 0, "baseline_count": count})
    out.sort(key=lambda x: str(x.get("name") or ""))
    return out


def _metric_row(
    id_: str,
    label: str,
    current: float | None,
    baseline: float | None,
    higher_is_better: bool,
    fmt: str = "count",
) -> dict[str, Any]:
    delta = round((current - baseline) * 10) / 10 if current is not None and baseline is not None else None
    return {
        "id": id_,
        "label": label,
        "current": current,
        "baseline": baseline,
        "delta": delta,
        "higher_is_better": higher_is_better,
        "format": fmt,
    }


def build_content_metrics(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    cw = (current.get("content_analytics") or {}).get("word_count_stats") or {}
    bw = (baseline.get("content_analytics") or {}).get("word_count_stats") or {}
    cur_thin = len((current.get("content_analytics") or {}).get("thin_pages") or [])
    if not cur_thin:
        cur_thin = int((current.get("seo_health") or {}).get("thin_content") or 0)
    base_thin = len((baseline.get("content_analytics") or {}).get("thin_pages") or [])
    if not base_thin:
        base_thin = int((baseline.get("seo_health") or {}).get("thin_content") or 0)
    cs = current.get("social_coverage") or {}
    bs = baseline.get("social_coverage") or {}
    rows = [
        _metric_row("mean_words", "Mean words", _num(cw.get("mean")), _num(bw.get("mean")), True),
        _metric_row("median_words", "Median words", _num(cw.get("median")), _num(bw.get("median")), True),
        _metric_row("thin_pages", "Thin pages", float(cur_thin), float(base_thin), False),
        _metric_row("dup_groups", "Duplicate groups", float(len(current.get("content_duplicates") or [])),
                    float(len(baseline.get("content_duplicates") or [])), False),
        _metric_row("og_cov", "OG coverage %", _num(cs.get("og_coverage_pct")), _num(bs.get("og_coverage_pct")), True, "percent"),
        _metric_row("tw_cov", "Twitter coverage %", _num(cs.get("twitter_coverage_pct")), _num(bs.get("twitter_coverage_pct")), True, "percent"),
        _metric_row("resp_p50", "Response p50 ms", _num((current.get("response_time_stats") or {}).get("p50")),
                    _num((baseline.get("response_time_stats") or {}).get("p50")), False),
        _metric_row("resp_p95", "Response p95 ms", _num((current.get("response_time_stats") or {}).get("p95")),
                    _num((baseline.get("response_time_stats") or {}).get("p95")), False),
        _metric_row("crawl_time", "Crawl duration s", _num((current.get("summary") or {}).get("crawl_time_s")),
                    _num((baseline.get("summary") or {}).get("crawl_time_s")), False),
        _metric_row("count_3xx", "Redirect pages", _num((current.get("summary") or {}).get("count_3xx")),
                    _num((baseline.get("summary") or {}).get("count_3xx")), False),
        _metric_row("avg_outlinks", "Avg outlinks", _num((current.get("summary") or {}).get("avg_outlinks")),
                    _num((baseline.get("summary") or {}).get("avg_outlinks")), True),
    ]
    return [r for r in rows if r["current"] is not None or r["baseline"] is not None]


def build_google_metrics(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    cg = ((current.get("google") or {}).get("gsc") or {}).get("summary")
    bg = ((baseline.get("google") or {}).get("gsc") or {}).get("summary")
    ca = ((current.get("google") or {}).get("ga4") or {}).get("summary")
    ba = ((baseline.get("google") or {}).get("ga4") or {}).get("summary")
    has_gsc = cg is not None or bg is not None
    has_ga4 = ca is not None or ba is not None
    if not has_gsc and not has_ga4:
        return {"available": False, "metrics": []}
    rows: list[dict[str, Any]] = []
    if has_gsc:
        rows.extend([
            _metric_row("gsc_clicks", "GSC clicks", _num(cg.get("clicks") if isinstance(cg, dict) else None),
                        _num(bg.get("clicks") if isinstance(bg, dict) else None), True),
            _metric_row("gsc_impr", "GSC impressions", _num(cg.get("impressions") if isinstance(cg, dict) else None),
                        _num(bg.get("impressions") if isinstance(bg, dict) else None), True),
            _metric_row("gsc_ctr", "GSC CTR", _num(cg.get("ctr") if isinstance(cg, dict) else None),
                        _num(bg.get("ctr") if isinstance(bg, dict) else None), True, "percent"),
            _metric_row("gsc_pos", "GSC position", _num(cg.get("position") if isinstance(cg, dict) else None),
                        _num(bg.get("position") if isinstance(bg, dict) else None), False),
        ])
    if has_ga4:
        rows.extend([
            _metric_row("ga4_sessions", "GA4 sessions", _num(ca.get("sessions") if isinstance(ca, dict) else None),
                        _num(ba.get("sessions") if isinstance(ba, dict) else None), True),
            _metric_row("ga4_users", "GA4 users", _num(ca.get("activeUsers") if isinstance(ca, dict) else None),
                        _num(ba.get("activeUsers") if isinstance(ba, dict) else None), True),
            _metric_row("ga4_views", "GA4 page views", _num(ca.get("screenPageViews") if isinstance(ca, dict) else None),
                        _num(ba.get("screenPageViews") if isinstance(ba, dict) else None), True),
            _metric_row("ga4_engagement", "GA4 engagement", _num(ca.get("engagementRate") if isinstance(ca, dict) else None),
                        _num(ba.get("engagementRate") if isinstance(ba, dict) else None), True, "percent"),
        ])
    metrics = [r for r in rows if r["current"] is not None or r["baseline"] is not None]
    return {"available": True, "metrics": metrics}


def build_seo_health_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    cur = current.get("seo_health") or {}
    base = baseline.get("seo_health") or {}
    out: list[dict[str, Any]] = []
    for key, label, higher in _SEO_HEALTH_FIELDS:
        c = int(cur.get(key) or 0)
        b = int(base.get(key) or 0)
        if c == b:
            continue
        out.append({
            "id": key,
            "label": label,
            "current": c,
            "baseline": b,
            "delta": c - b,
            "higher_is_better": higher,
        })
    out.sort(key=lambda x: abs(x.get("delta") or 0), reverse=True)
    return out


def build_category_scores(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    base_map = {
        str(c.get("id") or c.get("name") or "").strip(): c
        for c in (baseline.get("categories") or [])
        if isinstance(c, dict) and str(c.get("id") or c.get("name") or "").strip()
    }
    rows: list[dict[str, Any]] = []
    for c in current.get("categories") or []:
        if not isinstance(c, dict):
            continue
        k = str(c.get("id") or c.get("name") or "").strip()
        if not k:
            continue
        b = base_map.get(k)
        cur_score = _num(c.get("score"))
        base_score = _num(b.get("score")) if isinstance(b, dict) else None
        delta = (cur_score - base_score) if cur_score is not None and base_score is not None else None
        rows.append({
            "id": k,
            "name": str(c.get("name") or c.get("id") or k),
            "current": round(cur_score) if cur_score is not None else None,
            "baseline": round(base_score) if base_score is not None else None,
            "delta": round(delta) if delta is not None else None,
        })
    rows.sort(key=lambda x: abs(x.get("delta") or 0), reverse=True)
    return rows


def build_url_set_diff(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    """URLs added or removed between crawl link tables."""
    def _url_map(payload: dict[str, Any]) -> dict[str, str]:
        out: dict[str, str] = {}
        for link in payload.get("links") or []:
            if not isinstance(link, dict):
                continue
            raw = str(link.get("url") or "").strip()
            k = norm_report_url(raw)
            if k and k not in out:
                out[k] = raw
        return out

    cur_map = _url_map(current)
    base_map = _url_map(baseline)
    new_norm = sorted(set(cur_map) - set(base_map))
    removed_norm = sorted(set(base_map) - set(cur_map))
    return {
        "new_urls": [cur_map[k] for k in new_norm],
        "removed_urls": [base_map[k] for k in removed_norm],
        "new_count": len(new_norm),
        "removed_count": len(removed_norm),
    }


def build_indexation_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    """Indexation coverage count and gap list changes between reports."""
    cur_cov = current.get("indexation_coverage") if isinstance(current.get("indexation_coverage"), dict) else {}
    base_cov = baseline.get("indexation_coverage") if isinstance(baseline.get("indexation_coverage"), dict) else {}
    cur_counts = cur_cov.get("counts") if isinstance(cur_cov.get("counts"), dict) else {}
    base_counts = base_cov.get("counts") if isinstance(base_cov.get("counts"), dict) else {}
    count_deltas: list[dict[str, Any]] = []
    for key in sorted(set(cur_counts) | set(base_counts)):
        cur_v = cur_counts.get(key)
        base_v = base_counts.get(key)
        try:
            delta = int(cur_v or 0) - int(base_v or 0)
        except (TypeError, ValueError):
            delta = None
        count_deltas.append({"metric": key, "current": cur_v, "baseline": base_v, "delta": delta})
    gap_types = ("sitemap_only", "crawled_not_in_sitemap", "gsc_not_crawled")
    gap_deltas: dict[str, Any] = {}
    cur_lists = cur_cov.get("lists") if isinstance(cur_cov.get("lists"), dict) else {}
    base_lists = base_cov.get("lists") if isinstance(base_cov.get("lists"), dict) else {}

    def _norm_set(items: list[Any]) -> set[str]:
        return {norm_report_url(str(u)) for u in items if u}

    for gap in gap_types:
        cur_set = _norm_set(cur_lists.get(gap) or [])
        base_set = _norm_set(base_lists.get(gap) or [])
        added = sorted(cur_set - base_set)
        removed = sorted(base_set - cur_set)
        gap_deltas[gap] = {
            "added_count": len(added),
            "removed_count": len(removed),
            "added": added[:50],
            "removed": removed[:50],
        }
    return {"count_deltas": count_deltas, "gap_deltas": gap_deltas}


def build_orphan_deltas(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    """Orphan URL set changes between reports."""
    def _orphan_set(payload: dict[str, Any]) -> set[str]:
        urls = payload.get("orphan_urls") or []
        if not isinstance(urls, list):
            return set()
        return {norm_report_url(str(u)) for u in urls if u}

    cur_set = _orphan_set(current)
    base_set = _orphan_set(baseline)
    added = sorted(cur_set - base_set)
    removed = sorted(base_set - cur_set)
    return {
        "current_count": len(cur_set),
        "baseline_count": len(base_set),
        "delta": len(cur_set) - len(base_set),
        "added": added[:100],
        "removed": removed[:100],
        "added_count": len(added),
        "removed_count": len(removed),
    }


def build_full_compare(
    current: dict[str, Any],
    baseline: dict[str, Any],
    *,
    current_report_id: int | None = None,
    baseline_report_id: int | None = None,
) -> dict[str, Any]:
    cur_health = _score_from_categories(current.get("categories") or [])
    base_health = _score_from_categories(baseline.get("categories") or [])
    issue_deltas = build_issue_deltas(current, baseline)
    truncated_sections: dict[str, bool] = {}
    if len(issue_deltas) > _ISSUE_DELTA_CAP:
        truncated_sections["issue_deltas"] = True
        issue_deltas = issue_deltas[:_ISSUE_DELTA_CAP]
    link_metrics = build_link_metric_deltas(current, baseline)
    if len(link_metrics) > _LINK_METRIC_CAP:
        truncated_sections["link_metric_deltas"] = True
        link_metrics = link_metrics[:_LINK_METRIC_CAP]
    google = build_google_metrics(current, baseline)
    return {
        "current_report_id": current_report_id,
        "baseline_report_id": baseline_report_id,
        "current_generated_at": current.get("report_generated_at"),
        "baseline_generated_at": baseline.get("report_generated_at"),
        "health_score": {
            "current": cur_health,
            "baseline": base_health,
            "delta": (cur_health - base_health) if cur_health is not None and base_health is not None else None,
        },
        "category_scores": build_category_scores(current, baseline),
        "priority_counts": build_priority_counts(current, baseline),
        "issue_deltas": issue_deltas,
        "lighthouse_url_deltas": build_lighthouse_url_deltas(current, baseline),
        "link_metric_deltas": link_metrics,
        "redirect_deltas": build_redirect_deltas(current, baseline),
        "security_deltas": build_security_deltas(current, baseline),
        "duplicate_deltas": build_duplicate_deltas(current, baseline),
        "tech_deltas": build_tech_deltas(current, baseline),
        "content_metrics": build_content_metrics(current, baseline),
        "google_metrics": google.get("metrics") or [],
        "google_available": google.get("available", False),
        "seo_health_metrics": build_seo_health_deltas(current, baseline),
        "truncated_sections": truncated_sections,
    }
