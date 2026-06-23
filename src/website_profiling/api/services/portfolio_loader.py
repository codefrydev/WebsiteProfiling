"""Portfolio grouping for /api/report/portfolio — port of web/src/lib/homePortfolio.ts."""
from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from psycopg import Connection

from website_profiling.db.report_store import read_report_payload, read_report_payloads_portfolio

from .report_loader import (
    list_crawl_runs,
    list_crawl_run_summaries,
    list_reports,
    list_reports_latest_per_domain,
)

PORTFOLIO_CATEGORY_ORDER = (
    "technical_seo",
    "performance",
    "core_web_vitals",
    "link_health",
    "security",
    "html_accessibility",
    "mobile",
    "intelligence",
)

EMPTY_ISSUE_COUNTS = {"critical": 0, "high": 0, "medium": 0, "low": 0}

DATA_SOURCE_IDS = frozenset({
    "crawl",
    "lighthouse",
    "search_console",
    "analytics",
    "backlinks",
})

UNKNOWN_BRAND = "Unknown property"
EM_DASH = "—"

# Portfolio home only needs recent crawl-only rows; aggregating every crawl run is slow on large DBs.
PORTFOLIO_MAX_CRAWL_RUNS = 120
PORTFOLIO_GROUPS_CACHE_TTL_S = 45.0

_groups_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _portfolio_groups_cache_key(conn: Connection) -> str:
    try:
        rep = conn.execute("SELECT COUNT(*)::int, MAX(id) FROM report_payload").fetchone()
        crawl = conn.execute("SELECT COUNT(*)::int, MAX(id) FROM crawl_runs").fetchone()
        rep_count = int(rep[0] if rep else 0)
        rep_max = int(rep[1] or 0) if rep else 0
        crawl_count = int(crawl[0] if crawl else 0)
        crawl_max = int(crawl[1] or 0) if crawl else 0
        return f"{rep_count}:{rep_max}:{crawl_count}:{crawl_max}"
    except Exception:
        return "unknown"


def _get_cached_groups(key: str) -> dict[str, Any] | None:
    entry = _groups_cache.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > PORTFOLIO_GROUPS_CACHE_TTL_S:
        _groups_cache.pop(key, None)
        return None
    return payload


def _set_cached_groups(key: str, payload: dict[str, Any]) -> None:
    _groups_cache[key] = (time.time(), payload)


def _extract_hostname(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = urlparse(str(url)).hostname
        return host.lower() if host else ""
    except Exception:
        return ""


def _slugify_domain(name: str | None) -> str:
    if not name:
        return ""
    s = re.sub(r"[^a-z0-9]+", "-", str(name).strip().lower()).strip("-")
    return s


def _canonical_domain_from_payload(
    payload: dict[str, Any],
    start_url_by_run_id: dict[int, str],
) -> str:
    run_id = payload.get("crawl_run_id")
    run_id = int(run_id) if run_id is not None else None
    run_start = start_url_by_run_id.get(run_id, "") if run_id is not None else ""
    top_pages = payload.get("top_pages") or []
    links = payload.get("links") or []
    fallback = ""
    if top_pages and isinstance(top_pages[0], dict):
        fallback = str(top_pages[0].get("url") or "")
    if not fallback and links and isinstance(links[0], dict):
        fallback = str(links[0].get("url") or "")
    start_domain = _extract_hostname(run_start)
    fallback_domain = _extract_hostname(fallback)
    return (start_domain or fallback_domain or "").lower()


def _crawled_url_count(payload: dict[str, Any]) -> int:
    scope = (payload.get("report_meta") or {}).get("crawl_scope") or {}
    pages = scope.get("pages_crawled")
    if pages is not None:
        try:
            n = int(pages)
            if n > 0:
                return n
        except (TypeError, ValueError):
            pass
    summary = payload.get("summary") or {}
    total = summary.get("total_urls")
    if total is not None:
        try:
            n = int(total)
            if n > 0:
                return n
        except (TypeError, ValueError):
            pass
    links = payload.get("links") or []
    return len(links) if links else 0


def _score_from_categories(categories: list[dict[str, Any]]) -> int | None:
    nums = [
        float(c["score"])
        for c in categories
        if isinstance(c.get("score"), (int, float))
    ]
    if not nums:
        return None
    return round(sum(nums) / len(nums))


def _issue_counts_from_payload(payload: dict[str, Any]) -> tuple[dict[str, int], int]:
    counts = dict(EMPTY_ISSUE_COUNTS)
    for cat in payload.get("categories") or []:
        for iss in cat.get("issues") or []:
            p = str(iss.get("priority") or "Medium")
            if p == "Critical":
                counts["critical"] += 1
            elif p == "High":
                counts["high"] += 1
            elif p == "Low":
                counts["low"] += 1
            else:
                counts["medium"] += 1
    total = sum(counts.values())
    return counts, total


def _category_score(payload: dict[str, Any], cat_id: str) -> int | None:
    for cat in payload.get("categories") or []:
        if cat.get("id") == cat_id and isinstance(cat.get("score"), (int, float)):
            return round(float(cat["score"]))
    return None


def _lh_scores(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    summary = payload.get("lighthouse_summary")
    if not isinstance(summary, dict):
        return None, None
    mm = summary.get("median_metrics") or {}
    cs = summary.get("category_scores") or {}
    perf_raw = mm.get("performance_score") or cs.get("performance")
    seo_raw = mm.get("seo_score") or cs.get("seo")
    perf = round(float(perf_raw)) if isinstance(perf_raw, (int, float)) else None
    seo = round(float(seo_raw)) if isinstance(seo_raw, (int, float)) else None
    return perf, seo


def _category_snapshots(payload: dict[str, Any]) -> list[dict[str, Any]]:
    cats = payload.get("categories") or []
    by_id = {str(c.get("id") or ""): c for c in cats}
    out: list[dict[str, Any]] = []

    def push(cat_id: str) -> None:
        cat = by_id.get(cat_id)
        if not cat or not isinstance(cat.get("score"), (int, float)):
            return
        out.append({
            "id": cat_id,
            "name": str(cat.get("name") or cat_id),
            "score": round(float(cat["score"])),
            "issueCount": len(cat.get("issues") or []),
        })

    for cat_id in PORTFOLIO_CATEGORY_ORDER:
        push(cat_id)
    for cat in cats:
        cat_id = str(cat.get("id") or "")
        if not cat_id or any(r["id"] == cat_id for r in out):
            continue
        if not isinstance(cat.get("score"), (int, float)):
            continue
        out.append({
            "id": cat_id,
            "name": str(cat.get("name") or cat_id),
            "score": round(float(cat["score"])),
            "issueCount": len(cat.get("issues") or []),
        })
    return out


def _seo_signals(payload: dict[str, Any]) -> dict[str, int] | None:
    s = payload.get("seo_health")
    if not isinstance(s, dict):
        return None
    return {
        "missingTitles": int(s.get("missing_title") or 0),
        "missingMetaDesc": int(s.get("missing_meta_desc") or 0),
        "thinContent": int(s.get("thin_content") or 0),
        "h1Issues": int(s.get("h1_zero") or 0) + int(s.get("h1_multi") or 0),
    }


def _median_word_count(payload: dict[str, Any]) -> int | None:
    median = (payload.get("content_analytics") or {}).get("word_count_stats", {}).get("median")
    return round(float(median)) if isinstance(median, (int, float)) else None


def _median_response_ms(payload: dict[str, Any]) -> int | None:
    median = (payload.get("response_time_stats") or {}).get("p50")
    return round(float(median)) if isinstance(median, (int, float)) else None


def _data_sources(payload: dict[str, Any]) -> list[str] | None:
    raw = (payload.get("report_meta") or {}).get("data_sources") or []
    out = [str(s) for s in raw if str(s) in DATA_SOURCE_IDS]
    return out or None


def _crawl_config_from_payload(
    payload: dict[str, Any],
    run_meta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    scope = (payload.get("report_meta") or {}).get("crawl_scope")
    if not scope and not (run_meta or {}).get("render_mode") and not (run_meta or {}).get("discovery_mode"):
        return None
    cfg: dict[str, Any] = dict(scope) if isinstance(scope, dict) else {}
    if run_meta:
        if run_meta.get("render_mode") and "render_mode" not in cfg:
            cfg["render_mode"] = run_meta["render_mode"]
        if run_meta.get("discovery_mode"):
            cfg["discovery_mode"] = run_meta["discovery_mode"]
    return cfg or None


def _crawl_config_from_summary(row: dict[str, Any]) -> dict[str, Any] | None:
    if not row.get("render_mode") and not row.get("discovery_mode") and not row.get("url_count"):
        return None
    return {
        "pages_crawled": row.get("url_count"),
        "render_mode": row.get("render_mode"),
        "discovery_mode": row.get("discovery_mode"),
    }


def _to_display_datetime(value: str | None) -> str:
    if not value:
        return ""
    try:
        if isinstance(value, datetime):
            return value.isoformat()
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.isoformat()
    except Exception:
        return str(value)


def _generated_at_ms(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000
    except Exception:
        return 0.0


def _title_coverage_pct(with_title: int, url_count: int) -> int:
    if url_count <= 0:
        return 0
    return round((with_title / url_count) * 100)


def load_portfolio_maps(conn: Connection, *, max_crawl_runs: int | None = None) -> dict[str, Any]:
    crawl_rows = list_crawl_runs(conn)
    start_url_by_run_id = {int(r["id"]): r["start_url"] for r in crawl_rows}
    run_created_at_by_run_id = {int(r["id"]): r["created_at"] for r in crawl_rows}
    run_meta_by_run_id = {
        int(r["id"]): {
            "render_mode": r.get("render_mode"),
            "discovery_mode": r.get("discovery_mode"),
        }
        for r in crawl_rows
    }
    crawl_summaries = list_crawl_run_summaries(conn, max_runs=max_crawl_runs)
    return {
        "start_url_by_run_id": start_url_by_run_id,
        "run_created_at_by_run_id": run_created_at_by_run_id,
        "run_meta_by_run_id": run_meta_by_run_id,
        "crawl_summaries": crawl_summaries,
    }


def compute_domain_groups(
    report_list: list[dict[str, Any]],
    maps: dict[str, Any],
    get_payload: Callable[[int], dict[str, Any] | None],
) -> list[dict[str, Any]]:
    start_url_by_run_id: dict[int, str] = maps["start_url_by_run_id"]
    run_created_at_by_run_id: dict[str, str] = maps["run_created_at_by_run_id"]
    run_meta_by_run_id: dict[int, dict[str, Any]] = maps["run_meta_by_run_id"]
    brand_map: dict[str, dict[str, Any]] = {}

    for r in report_list:
        report_id = int(r["id"])
        payload = get_payload(report_id)
        if not payload:
            continue

        run_id = payload.get("crawl_run_id")
        run_id_int = int(run_id) if run_id is not None else None
        run_start_url = start_url_by_run_id.get(run_id_int, "") if run_id_int is not None else ""
        top = payload.get("top_pages") or []
        links = payload.get("links") or []
        if top and isinstance(top[0], dict):
            fallback_url = str(top[0].get("url") or "")
        elif links and isinstance(links[0], dict):
            fallback_url = str(links[0].get("url") or "")
        else:
            fallback_url = ""
        crawl_url = (run_start_url or fallback_url or "").strip()
        start_domain = _extract_hostname(run_start_url)
        fallback_domain = _extract_hostname(crawl_url)
        domain_name = start_domain or fallback_domain or str(payload.get("site_name") or UNKNOWN_BRAND)
        brand_key = start_domain or (f"fallback:{fallback_domain}" if fallback_domain else f"report:{report_id}")

        summary = payload.get("summary") or {}
        status_counts = {
            "s2xx": int(summary.get("count_2xx") or 0),
            "s3xx": int(summary.get("count_3xx") or 0),
            "s4xx": int(summary.get("count_4xx") or 0),
            "s5xx": int(summary.get("count_5xx") or 0),
            "other": int(summary.get("count_error") or 0),
        }
        url_count = _crawled_url_count(payload)
        success_pct = round((status_counts["s2xx"] / url_count) * 100) if url_count > 0 else 0
        health_score = _score_from_categories(payload.get("categories") or []) or 0
        run_created_at = run_created_at_by_run_id.get(run_id_int, "") if run_id_int is not None else ""
        last_crawl = _to_display_datetime(
            run_created_at or payload.get("crawl_run_created_at") or payload.get("report_generated_at") or r.get("generated_at")
        )
        last_audit = _to_display_datetime(payload.get("report_generated_at") or r.get("generated_at"))
        generated_at_ms = _generated_at_ms(r.get("generated_at"))
        issue_counts, total_issues = _issue_counts_from_payload(payload)
        perf_score, seo_score = _lh_scores(payload)
        technical_seo_score = _category_score(payload, "technical_seo")
        success_rate_raw = summary.get("success_rate")
        success_rate = (
            round(float(success_rate_raw))
            if isinstance(success_rate_raw, (int, float))
            else (success_pct if url_count > 0 else None)
        )
        crawl_duration_s = (
            round(float(summary["crawl_time_s"]))
            if isinstance(summary.get("crawl_time_s"), (int, float))
            else None
        )
        run_meta = run_meta_by_run_id.get(run_id_int) if run_id_int is not None else None
        canonical_host = _canonical_domain_from_payload(payload, start_url_by_run_id) or _slugify_domain(
            str(payload.get("site_name") or "")
        )
        data_sources = _data_sources(payload)

        group = {
            "domainName": domain_name,
            "crawlUrl": crawl_url or EM_DASH,
            "urlCount": url_count,
            "healthScore": health_score,
            "statusCounts": status_counts,
            "lastCrawl": last_crawl,
            "lastAudit": last_audit,
            "totalIssues": total_issues,
            "issueCounts": issue_counts,
            "successRate": success_rate,
            "titleCoverage": None,
            "avgWordCount": None,
            "thinPages": None,
            "technicalSeoScore": technical_seo_score,
            "perfScore": perf_score,
            "seoScore": seo_score,
            "crawlDurationS": crawl_duration_s,
            "categorySnapshots": _category_snapshots(payload),
            "seoSignals": _seo_signals(payload),
            "securityFindings": len(payload.get("security_findings") or []),
            "duplicateClusters": len(payload.get("content_duplicates") or []),
            "medianWordCount": _median_word_count(payload),
            "medianResponseMs": _median_response_ms(payload),
            "reportId": report_id,
            "crawlRunId": run_id_int,
            "generatedAtMs": generated_at_ms,
            "domainParam": canonical_host,
            "crawlConfig": _crawl_config_from_payload(payload, run_meta),
            "dataSources": data_sources,
        }

        existing = brand_map.get(brand_key)
        if not existing or generated_at_ms > existing["generatedAtMs"]:
            brand_map[brand_key] = group

    return sorted(brand_map.values(), key=lambda g: g["generatedAtMs"], reverse=True)


def compute_crawl_only_groups(
    crawl_summaries: list[dict[str, Any]],
    report_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    covered_domains = {
        (g.get("domainParam") or _extract_hostname(g.get("crawlUrl")) or g.get("domainName", "")).lower()
        for g in report_groups
        if g.get("domainParam") or g.get("crawlUrl") or g.get("domainName")
    }
    covered_run_ids = {
        int(g["crawlRunId"])
        for g in report_groups
        if g.get("crawlRunId") is not None
    }

    brand_map: dict[str, dict[str, Any]] = {}
    for row in crawl_summaries:
        crawl_run_id = int(row["crawl_run_id"])
        if crawl_run_id in covered_run_ids:
            continue
        start_url = str(row.get("start_url") or "").strip()
        domain_name = _extract_hostname(start_url) or UNKNOWN_BRAND
        domain_key = domain_name.lower()
        if not domain_key or domain_key in covered_domains:
            continue

        url_count = int(row.get("url_count") or 0)
        with_title = int(row.get("with_title") or 0)
        title_coverage = _title_coverage_pct(with_title, url_count)
        avg_word_count = round(float(row.get("avg_word_count") or 0))
        thin_pages = int(row.get("thin_pages") or 0)
        generated_at_ms = _generated_at_ms(row.get("created_at"))

        existing = brand_map.get(domain_key)
        if existing and generated_at_ms <= existing["generatedAtMs"]:
            continue

        brand_map[domain_key] = {
            "domainName": domain_name,
            "crawlUrl": start_url or EM_DASH,
            "urlCount": url_count,
            "healthScore": title_coverage,
            "statusCounts": {
                "s2xx": int(row.get("s2xx") or 0),
                "s3xx": int(row.get("s3xx") or 0),
                "s4xx": int(row.get("s4xx") or 0),
                "s5xx": int(row.get("s5xx") or 0),
                "other": int(row.get("other") or 0),
            },
            "lastCrawl": _to_display_datetime(row.get("created_at")),
            "lastAudit": "",
            "totalIssues": 0,
            "issueCounts": dict(EMPTY_ISSUE_COUNTS),
            "successRate": None,
            "titleCoverage": title_coverage,
            "avgWordCount": avg_word_count,
            "thinPages": thin_pages,
            "technicalSeoScore": None,
            "perfScore": None,
            "seoScore": None,
            "crawlDurationS": None,
            "categorySnapshots": [],
            "seoSignals": None,
            "securityFindings": 0,
            "duplicateClusters": 0,
            "medianWordCount": avg_word_count or None,
            "medianResponseMs": None,
            "reportId": None,
            "crawlRunId": crawl_run_id,
            "crawlOnly": True,
            "generatedAtMs": generated_at_ms,
            "domainParam": domain_key,
            "crawlConfig": _crawl_config_from_summary(row),
        }

    return list(brand_map.values())


def merge_portfolio_groups(
    report_groups: list[dict[str, Any]],
    crawl_only_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return sorted(
        report_groups + crawl_only_groups,
        key=lambda g: g["generatedAtMs"],
        reverse=True,
    )


def build_crawl_history_by_domain(
    summaries: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    by_domain: dict[str, list[dict[str, Any]]] = {}
    for row in summaries:
        key = _extract_hostname(row.get("start_url"))
        if not key:
            continue
        pages = int(row.get("url_count") or 0)
        point = {
            "pagesDiscovered": pages,
            "titleCoverage": _title_coverage_pct(int(row.get("with_title") or 0), pages),
            "avgWordCount": round(float(row.get("avg_word_count") or 0)),
            "createdAtMs": _generated_at_ms(row.get("created_at")),
        }
        by_domain.setdefault(key, []).append(point)

    out: dict[str, list[dict[str, Any]]] = {}
    for key, points in by_domain.items():
        out[key] = sorted(points, key=lambda p: p["createdAtMs"])[-8:]
    return out


def compute_portfolio_summary(groups: list[dict[str, Any]]) -> dict[str, Any]:
    total_brands = len(groups)
    total_urls = sum(int(g.get("urlCount") or 0) for g in groups)
    avg_health = (
        round(sum(int(g.get("healthScore") or 0) for g in groups) / total_brands)
        if total_brands
        else None
    )
    return {"totalBrands": total_brands, "totalUrls": total_urls, "avgHealth": avg_health}


def build_portfolio_card(
    conn: Connection,
    report_list: list[dict[str, Any]],
    maps: dict[str, Any],
    *,
    report_id: int | None = None,
    crawl_run_id: int | None = None,
) -> dict[str, Any] | None:
    def get_full_payload(rid: int) -> dict[str, Any] | None:
        return read_report_payload(conn, rid)

    if report_id is not None:
        row = next((r for r in report_list if int(r["id"]) == report_id), None)
        if not row:
            return None
        groups = compute_domain_groups([row], maps, get_full_payload)
        return groups[0] if groups else None

    if crawl_run_id is not None:
        try:
            cur = conn.execute(
                """
                SELECT id FROM report_payload
                WHERE (data->>'crawl_run_id')::bigint = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (int(crawl_run_id),),
            )
            match = cur.fetchone()
        except Exception:
            match = None
        if match is not None:
            rid = int(match[0] if isinstance(match, (list, tuple)) else match["id"])
            row = next((r for r in report_list if int(r["id"]) == rid), {"id": rid, "generated_at": None})
            groups = compute_domain_groups([row], maps, get_full_payload)
            from_report = groups[0] if groups else None
            if from_report:
                return from_report
        summary = next(
            (s for s in maps["crawl_summaries"] if int(s["crawl_run_id"]) == crawl_run_id),
            None,
        )
        if not summary:
            return None
        crawl_only = compute_crawl_only_groups([summary], [])
        return crawl_only[0] if crawl_only else None

    return None


def build_groups_bundle(
    conn: Connection,
    report_list: list[dict[str, Any]],
    *,
    lite: bool,
) -> dict[str, Any]:
    maps = load_portfolio_maps(conn, max_crawl_runs=PORTFOLIO_MAX_CRAWL_RUNS)
    report_ids = [int(r["id"]) for r in report_list]
    payload_by_id = read_report_payloads_portfolio(conn, report_ids)

    def get_payload(rid: int) -> dict[str, Any] | None:
        return payload_by_id.get(rid)

    report_groups = compute_domain_groups(report_list, maps, get_payload)
    crawl_only = compute_crawl_only_groups(maps["crawl_summaries"], report_groups)
    groups = merge_portfolio_groups(report_groups, crawl_only)
    crawl_history = build_crawl_history_by_domain(maps["crawl_summaries"])
    return {"groups": groups, "crawlHistoryByDomain": crawl_history}


def get_portfolio_response(
    conn: Connection,
    *,
    widget: str,
    ids: list[int],
    report_id: int | None = None,
    crawl_run_id: int | None = None,
) -> dict[str, Any]:
    if widget == "groups":
        cache_key = _portfolio_groups_cache_key(conn)
        cached = _get_cached_groups(cache_key)
        if cached is not None:
            return cached

    all_reports = list_reports(conn)
    id_set = set(ids)
    if widget in ("groups", "summary") and not ids:
        report_list = list_reports_latest_per_domain(conn)
    elif ids:
        report_list = [r for r in all_reports if r["id"] in id_set]
    else:
        report_list = all_reports

    if widget == "card":
        maps = load_portfolio_maps(conn)
        group = build_portfolio_card(
            conn,
            report_list,
            maps,
            report_id=report_id,
            crawl_run_id=crawl_run_id,
        )
        return {"group": group}

    lite = widget in ("groups", "summary")
    bundle = build_groups_bundle(conn, report_list, lite=lite)

    if widget == "summary":
        return compute_portfolio_summary(bundle["groups"])

    payload = {
        "groups": bundle["groups"],
        "crawlHistoryByDomain": bundle["crawlHistoryByDomain"],
    }
    if widget == "groups":
        _set_cached_groups(cache_key, payload)
    return payload
