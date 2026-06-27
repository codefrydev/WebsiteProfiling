"""GEO/AEO readiness tools: llms.txt, AI discovery, FAQ schema, citation signals, link suggestions.

Score model (100 pts):
  Robots.txt       /18  – AI bot access tiers
  llms.txt         /18  – presence + depth
  Schema JSON-LD   /16  – richness across pages
  Meta tags        /14  – title/desc/canonical/OG
  Content          /12  – word-count, headings, lists
  Brand & Entity   /10  – org schema, entity richness
  Signals          /6   – sitemap, RSS, dateModified
  AI Discovery     /6   – .well-known/ai.txt + /ai/*.json

Score bands: 86-100 Excellent · 68-85 Good · 36-67 Foundation · 0-35 Critical
"""
from __future__ import annotations

import math
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from psycopg import Connection

from .._slice import _row_schema_types_list, cap_list, parse_limit
from ..context import AuditToolContext

_FAQ_TYPES = frozenset({"faqpage", "qapage", "question"})
_QA_URL_HINTS = ("/faq", "/faqs", "/help", "/support", "/questions")

_SCORE_BANDS = (
    (86, "Excellent"),
    (68, "Good"),
    (36, "Foundation"),
    (0, "Critical"),
)


def _band(score: float) -> str:
    for threshold, label in _SCORE_BANDS:
        if score >= threshold:
            return label
    return "Critical"


def _base_url(domain: str) -> str:
    """Normalise domain/URL to a bare ``https://hostname`` base."""
    return f"https://{re.sub(r'^https?://', '', domain).split('/')[0]}"


# ---------------------------------------------------------------------------
# llms.txt helpers
# ---------------------------------------------------------------------------

def _fetch_llms_txt(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found": False, "error": "domain unknown"}
    base = _base_url(domain)
    paths = ("/llms.txt", "/.well-known/llms.txt")
    for path in paths:
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=8, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and resp.text.strip():
                text = resp.text.strip()
                depth = _score_llms_txt_depth(text)
                return {
                    "found": True,
                    "url": url,
                    "status_code": resp.status_code,
                    "size_bytes": len(resp.content),
                    "preview": text[:500],
                    "depth": depth,
                }
        except requests.RequestException:
            continue
    return {"found": False, "checked_urls": [urljoin(base, p) for p in paths]}


def _score_llms_txt_depth(text: str) -> dict[str, Any]:
    """Parse llms.txt structure and return a depth score /18."""
    lines = text.splitlines()
    has_h1 = any(l.startswith("# ") for l in lines)
    has_blockquote = any(l.startswith("> ") for l in lines)
    section_count = sum(1 for l in lines if l.startswith("## "))
    link_count = len(re.findall(r"https?://[^\s)>]+", text))
    points = 0
    if has_h1:
        points += 4
    if has_blockquote:
        points += 3
    if section_count >= 2:
        points += 4
    elif section_count == 1:
        points += 2
    if link_count >= 5:
        points += 4
    elif link_count >= 2:
        points += 2
    elif link_count >= 1:
        points += 1
    if link_count >= 10:
        points += 3
    return {
        "has_h1": has_h1,
        "has_blockquote": has_blockquote,
        "section_count": section_count,
        "link_count": link_count,
        "depth_score": min(18, points),
    }


def _fetch_llms_full_txt(base: str) -> bool:
    """Check whether llms-full.txt exists."""
    for path in ("/llms-full.txt", "/.well-known/llms-full.txt"):
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=6, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and resp.text.strip():
                return True
        except requests.RequestException:
            continue
    return False


def get_llms_txt_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_llms_txt(domain)
    result["domain"] = domain
    result["provenance"] = "Crawl"
    if result.get("found"):
        result["llms_full_txt_found"] = _fetch_llms_full_txt(_base_url(domain))
    return result


# ---------------------------------------------------------------------------
# AI Discovery helpers
# ---------------------------------------------------------------------------

_AI_DISCOVERY_PATHS = (
    ("ai_txt", "/.well-known/ai.txt"),
    ("ai_summary_json", "/ai/summary.json"),
    ("ai_faq_json", "/ai/faq.json"),
    ("ai_service_json", "/ai/service.json"),
)


def _fetch_ai_discovery(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found_count": 0, "endpoints": {}, "error": "domain unknown"}
    base = _base_url(domain)
    endpoints: dict[str, Any] = {}
    found_count = 0
    for key, path in _AI_DISCOVERY_PATHS:
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=6, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and resp.text.strip():
                endpoints[key] = {"found": True, "url": url, "size_bytes": len(resp.content)}
                found_count += 1
            else:
                endpoints[key] = {"found": False, "url": url}
        except requests.RequestException:
            endpoints[key] = {"found": False, "url": url}
    score = min(6, found_count * 2) if found_count else 0
    return {"found_count": found_count, "endpoints": endpoints, "discovery_score": score}


def get_ai_discovery_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_ai_discovery(domain)
    result["domain"] = domain
    result["provenance"] = "Crawl"
    return result


# ---------------------------------------------------------------------------
# Meta/freshness signal helpers
# ---------------------------------------------------------------------------

def _score_meta_signals(domain: str) -> dict[str, Any]:
    """Fetch homepage and score meta/OG completeness /14."""
    if not domain:
        return {"meta_score": 0, "checked": False}
    base = _base_url(domain)
    try:
        resp = requests.get(base, timeout=8, headers={"User-Agent": "SiteAudit/1.0"})
        html = resp.text if resp.status_code == 200 else ""
    except requests.RequestException:
        return {"meta_score": 0, "checked": False}
    has_title = bool(re.search(r"<title[^>]*>[^<]{3,}</title>", html, re.I))
    has_desc = bool(re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']{10,}', html, re.I))
    has_canonical = bool(re.search(r'<link[^>]+rel=["\']canonical["\']', html, re.I))
    has_og_title = bool(re.search(r'<meta[^>]+property=["\']og:title["\']', html, re.I))
    has_og_desc = bool(re.search(r'<meta[^>]+property=["\']og:description["\']', html, re.I))
    has_og_image = bool(re.search(r'<meta[^>]+property=["\']og:image["\']', html, re.I))
    points = 0
    if has_title:
        points += 4
    if has_desc:
        points += 3
    if has_canonical:
        points += 3
    if has_og_title:
        points += 1
    if has_og_desc:
        points += 1
    if has_og_image:
        points += 2
    return {
        "meta_score": min(14, points),
        "has_title": has_title,
        "has_meta_description": has_desc,
        "has_canonical": has_canonical,
        "has_og_title": has_og_title,
        "has_og_description": has_og_desc,
        "has_og_image": has_og_image,
        "checked": True,
    }


def _score_freshness_signals(domain: str) -> dict[str, Any]:
    """Check sitemap, RSS/Atom feed, and dateModified signals /6."""
    if not domain:
        return {"freshness_score": 0, "checked": False}
    base = _base_url(domain)
    has_sitemap = False
    has_feed = False
    has_date_modified = False
    for path in ("/sitemap.xml", "/sitemap_index.xml"):
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=6, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and "<url" in resp.text.lower():
                has_sitemap = True
                if "lastmod" in resp.text.lower():
                    has_date_modified = True
                break
        except requests.RequestException:
            continue
    for path in ("/feed", "/feed.xml", "/rss.xml", "/atom.xml", "/feed/"):
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=6, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and (
                "<rss" in resp.text.lower() or "<feed" in resp.text.lower()
            ):
                has_feed = True
                break
        except requests.RequestException:
            continue
    points = 0
    if has_sitemap:
        points += 2
    if has_feed:
        points += 2
    if has_date_modified:
        points += 2
    return {
        "freshness_score": min(6, points),
        "has_sitemap": has_sitemap,
        "has_rss_atom_feed": has_feed,
        "has_date_modified_in_sitemap": has_date_modified,
        "checked": True,
    }


# ---------------------------------------------------------------------------
# FAQ schema helpers
# ---------------------------------------------------------------------------

def _has_faq_schema(row: dict[str, Any]) -> bool:
    types = [t.lower() for t in _row_schema_types_list(row)]
    return any(t in _FAQ_TYPES or "faq" in t for t in types)


def get_faq_schema_coverage(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages_with_faq_schema": 0, "total_2xx": 0, "coverage_pct": 0}
    total = 0
    with_faq = 0
    for _, row in df.iterrows():
        if not str(row.get("status") or "").startswith("2"):
            continue
        total += 1
        if _has_faq_schema(row.to_dict()):
            with_faq += 1
    pct = round(with_faq / total * 100, 1) if total else 0
    return {
        "pages_with_faq_schema": with_faq,
        "total_2xx": total,
        "coverage_pct": pct,
        "provenance": "Crawl",
    }


def list_pages_missing_faq_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "").lower()
        heading = str(rec.get("heading_text") or rec.get("h1") or "").lower()
        looks_qa = any(h in url for h in _QA_URL_HINTS) or "faq" in heading or "?" in heading
        if not looks_qa or _has_faq_schema(rec):
            continue
        pages.append({"url": str(rec.get("url") or ""), "title": str(rec.get("title") or ""), "reason": "qa_heuristic_no_faq_schema"})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Estimated"}


# ---------------------------------------------------------------------------
# Composite GEO readiness score  (8 categories, 100 pts, bands)
# ---------------------------------------------------------------------------

def get_geo_readiness_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """8-category GEO readiness score (0-100) with score bands.

    Categories (max pts):
      robots_ai_access /18, llms_txt /18, schema_json_ld /16,
      meta_tags /14, content /12, brand_entity /10,
      signals /6, ai_discovery /6
    """
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    df = scoped.load_crawl_df(conn)
    domain = scoped.resolve_property_domain(conn)

    # ---- schema / content / brand signals from crawl DF ----
    total_2xx = 0
    schema_pages = 0
    rich_schema_pages = 0
    good_word_count = 0
    good_headings = 0
    has_lists_pages = 0
    org_schema_pages = 0
    if df is not None and not df.empty:
        for _, row in df.iterrows():
            rec = row.to_dict()
            if not str(rec.get("status") or "").startswith("2"):
                continue
            total_2xx += 1
            schema_types = _row_schema_types_list(rec)
            has_any_schema = bool(schema_types) or str(rec.get("has_schema") or "").lower() in ("true", "1", "yes")
            if has_any_schema:
                schema_pages += 1
            if len(schema_types) >= 2:
                rich_schema_pages += 1
            if any(t.lower() in ("organization", "localbusiness", "corporation") for t in schema_types):
                org_schema_pages += 1
            try:
                wc = int(rec.get("word_count") or 0)
            except (TypeError, ValueError):
                wc = 0
            if wc >= 300:
                good_word_count += 1
            seq = str(rec.get("heading_sequence") or "")
            if seq and "h1" in seq.lower() and "h2" in seq.lower():
                good_headings += 1
            excerpt = str(rec.get("content_excerpt") or "")
            if re.search(r"^\s*[-*•]\s", excerpt, re.M) or "<li>" in str(rec.get("html") or "").lower():
                has_lists_pages += 1

    # ---- schema score /16 ----
    if total_2xx:
        schema_pct = schema_pages / total_2xx
        rich_pct = rich_schema_pages / total_2xx
    else:
        schema_pct = rich_pct = 0.0
    schema_raw = min(16, round(schema_pct * 10 + rich_pct * 6))

    # ---- content score /12 ----
    if total_2xx:
        content_raw = min(12, round(
            (good_word_count / total_2xx) * 6
            + (good_headings / total_2xx) * 4
            + (has_lists_pages / total_2xx) * 2
        ))
    else:
        content_raw = 0

    # ---- brand & entity score /10 ----
    ner = payload.get("ner_site_summary") if isinstance(payload.get("ner_site_summary"), dict) else {}
    entities = ner.get("entities") or ner.get("top_entities") or []
    entity_count = len(entities) if isinstance(entities, list) else 0
    faq_cov = get_faq_schema_coverage(conn, scoped, args)
    faq_pct = float(faq_cov.get("coverage_pct") or 0) / 100
    if total_2xx:
        brand_raw = min(10, round(
            min(entity_count * 0.5, 5.0)
            + (org_schema_pages / total_2xx) * 3
            + faq_pct * 2
        ))
    else:
        brand_raw = 0

    # ---- live HTTP checks (run concurrently to cut wall time) ----
    http_tasks = {
        "llms": _fetch_llms_txt,
        "robots": _score_robots_ai_access,
        "meta": _score_meta_signals,
        "freshness": _score_freshness_signals,
        "discovery": _fetch_ai_discovery,
    }
    http_results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(fn, domain): key for key, fn in http_tasks.items()}
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                http_results[key] = fut.result()
            except Exception:
                # A failing/raising live-HTTP task must degrade to a 0 sub-score,
                # not crash the whole composite score (mirrors
                # get_agent_readiness_score).
                http_results[key] = {}

    llms = http_results.get("llms", {})
    llms_depth = llms.get("depth", {}) if llms.get("found") else {}
    llms_raw = llms_depth.get("depth_score", 0) if llms.get("found") else 0

    robots_result = http_results.get("robots", {})
    robots_raw = robots_result.get("robots_score", 0)

    meta_result = http_results.get("meta", {})
    meta_raw = meta_result.get("meta_score", 0)

    freshness_result = http_results.get("freshness", {})
    freshness_raw = freshness_result.get("freshness_score", 0)

    discovery_result = http_results.get("discovery", {})
    discovery_raw = discovery_result.get("discovery_score", 0)

    total_score = round(
        robots_raw
        + llms_raw
        + schema_raw
        + meta_raw
        + content_raw
        + brand_raw
        + freshness_raw
        + discovery_raw,
        1,
    )
    total_score = min(100, total_score)

    categories = {
        "robots_ai_access": {"score": robots_raw, "max": 18},
        "llms_txt": {"score": llms_raw, "max": 18},
        "schema_json_ld": {"score": schema_raw, "max": 16},
        "meta_tags": {"score": meta_raw, "max": 14},
        "content": {"score": content_raw, "max": 12},
        "brand_entity": {"score": brand_raw, "max": 10},
        "signals": {"score": freshness_raw, "max": 6},
        "ai_discovery": {"score": discovery_raw, "max": 6},
    }

    # backward-compat flat components for GeoReadiness.tsx
    components = {
        "schema_coverage": round(schema_pct * 100, 1) if total_2xx else 0,
        "substantive_content": round(good_word_count / total_2xx * 100, 1) if total_2xx else 0,
        "heading_structure": round(good_headings / total_2xx * 100, 1) if total_2xx else 0,
        "faq_schema_coverage": float(faq_cov.get("coverage_pct") or 0),
        "entity_richness": min(100.0, entity_count * 5.0),
        "llms_txt_present": 100.0 if llms.get("found") else 0.0,
        "meta_tags": float(meta_raw / 14 * 100),
        "freshness_signals": float(freshness_raw / 6 * 100),
        "ai_discovery": float(discovery_raw / 6 * 100),
        "robots_ai_access": float(robots_raw / 18 * 100),
    }

    return {
        "geo_readiness_score": total_score,
        "band": _band(total_score),
        "categories": categories,
        "components": components,
        "llms_txt": {"found": llms.get("found", False), "depth": llms_depth},
        "provenance": "Estimated",
    }


def _score_robots_ai_access(domain: str) -> dict[str, Any]:
    """Score robots.txt AI-bot access /18 (imported by geo_list_tools)."""
    if not domain:
        return {"robots_score": 0, "checked": False}
    url = urljoin(_base_url(domain) + "/", "robots.txt")
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "SiteAudit/1.0"})
        robots_text = resp.text if resp.status_code == 200 else ""
    except requests.RequestException:
        return {"robots_score": 0, "checked": False, "error": "robots.txt not reachable"}
    if not robots_text.strip():
        return {"robots_score": 0, "checked": True, "missing": True}

    from .geo_list_tools import _AI_BOT_TIERS, _parse_robots_access

    access_map = _parse_robots_access(robots_text)
    # Citation bots must be allowed → highest impact
    citation_score = 0
    search_score = 0
    training_score = 0
    citation_bots = [b for b, t in _AI_BOT_TIERS.items() if t == "citation"]
    search_bots = [b for b, t in _AI_BOT_TIERS.items() if t == "search"]
    training_bots = [b for b, t in _AI_BOT_TIERS.items() if t == "training"]

    if citation_bots:
        allowed = sum(1 for b in citation_bots if access_map.get(b.lower()) != "blocked")
        citation_score = round(allowed / len(citation_bots) * 9)
    if search_bots:
        allowed = sum(1 for b in search_bots if access_map.get(b.lower()) != "blocked")
        search_score = round(allowed / len(search_bots) * 6)
    if training_bots:
        allowed = sum(1 for b in training_bots if access_map.get(b.lower()) != "blocked")
        training_score = round(allowed / len(training_bots) * 3)

    score = min(18, citation_score + search_score + training_score)
    return {
        "robots_score": score,
        "citation_bots_score": citation_score,
        "search_bots_score": search_score,
        "training_bots_score": training_score,
        "checked": True,
    }


# ---------------------------------------------------------------------------
# AEO per-URL signals
# ---------------------------------------------------------------------------

def get_aeo_content_signals_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    needle = url.lower()
    for _, row in df.iterrows():
        if str(row.get("url") or "").lower() != needle:
            continue
        rec = row.to_dict()
        excerpt = str(rec.get("content_excerpt") or "")
        words = excerpt.split()
        lead = " ".join(words[:80])
        has_list = bool(re.search(r"^\s*[-*•]\s", excerpt, re.M)) or "<li>" in str(rec.get("html") or "").lower()
        has_definition = bool(re.search(r"\b(is|are|means|refers to)\b", lead[:400], re.I))
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        entities = rec.get("top_keywords")
        if isinstance(entities, str):
            entities = [entities]
        entity_mentions = len(entities) if isinstance(entities, list) else 0
        quotability = 0
        if wc >= 200:
            quotability += 25
        if has_list:
            quotability += 20
        if has_definition:
            quotability += 25
        if _has_faq_schema(rec):
            quotability += 30
        return {
            "url": str(rec.get("url") or ""),
            "word_count": wc,
            "lead_excerpt": lead[:300],
            "has_lists": has_list,
            "has_definition_pattern": has_definition,
            "entity_keyword_count": entity_mentions,
            "quotability_score": min(100, quotability),
            "provenance": "Estimated",
        }
    return {"error": "url not found in crawl", "url": url}


# ---------------------------------------------------------------------------
# E-E-A-T signals
# ---------------------------------------------------------------------------

def get_eeat_signals_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True}
    author_pages = 0
    org_schema = 0
    about_contact = 0
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        types = [t.lower() for t in _row_schema_types_list(rec)]
        if any(t in ("person", "author") for t in types):
            author_pages += 1
        if any(t in ("organization", "localbusiness", "corporation") for t in types):
            org_schema += 1
        path = urlparse(str(rec.get("url") or "")).path.lower()
        if any(p in path for p in ("/about", "/contact", "/team", "/author")):
            about_contact += 1
    return {
        "pages_with_author_schema": author_pages,
        "pages_with_organization_schema": org_schema,
        "about_contact_pages": about_contact,
        "provenance": "Crawl",
    }


# ---------------------------------------------------------------------------
# JS rendering delta
# ---------------------------------------------------------------------------

def get_js_rendering_delta(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty or "fetch_method" not in df.columns:
        return {"deltas": [], "total": 0, "note": "fetch_method not in crawl — use javascript or auto render mode"}
    by_url: dict[str, dict[str, dict[str, Any]]] = {}
    for _, row in df.iterrows():
        url = str(row.get("url") or "").lower()
        method = str(row.get("fetch_method") or "static").lower()
        if not url:
            continue
        try:
            word_count = int(row.get("word_count") or 0)
        except (TypeError, ValueError):
            word_count = 0
        by_url.setdefault(url, {})[method] = {
            "title": str(row.get("title") or ""),
            "word_count": word_count,
            "h1": str(row.get("h1") or ""),
        }
    deltas: list[dict[str, Any]] = []
    for url, methods in by_url.items():
        static = methods.get("static")
        rendered = methods.get("rendered") or methods.get("javascript")
        if not static or not rendered:
            continue
        title_diff = static.get("title") != rendered.get("title")
        wc_diff = abs(int(static.get("word_count") or 0) - int(rendered.get("word_count") or 0))
        h1_diff = static.get("h1") != rendered.get("h1")
        if title_diff or wc_diff > 50 or h1_diff:
            deltas.append({
                "url": url,
                "static": static,
                "rendered": rendered,
                "title_differs": title_diff,
                "word_count_delta": wc_diff,
                "h1_differs": h1_diff,
            })
    deltas.sort(key=lambda d: -int(d.get("word_count_delta") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(deltas, limit, max_cap=50)
    return {"deltas": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Crawl"}


# ---------------------------------------------------------------------------
# Internal link suggestions (TF-IDF)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return [w.lower() for w in re.findall(r"[a-z0-9]{3,}", text)]


def get_internal_link_suggestions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """TF-IDF related pages with suggested anchor hints for a source URL."""
    scoped = ctx.with_args(args)
    source_url = str(args.get("url") or "").strip()
    if not source_url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "suggestions": []}
    docs: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "")
        text = " ".join([
            str(rec.get("title") or ""),
            str(rec.get("h1") or ""),
            str(rec.get("content_excerpt") or ""),
        ])
        tokens = _tokenize(text)
        if not tokens:
            continue
        docs.append({"url": url, "tokens": tokens, "title": str(rec.get("title") or "")})
    if len(docs) < 2:
        return {"url": source_url, "suggestions": [], "note": "insufficient crawl pages"}
    source_doc = next((d for d in docs if d["url"].lower() == source_url.lower()), None)
    if not source_doc:
        return {"error": "source url not in crawl", "url": source_url}
    df_counts = len(docs)
    idf: dict[str, float] = {}
    doc_freq: Counter[str] = Counter()
    for d in docs:
        for t in set(d["tokens"]):
            doc_freq[t] += 1
    for t, c in doc_freq.items():
        idf[t] = math.log((1 + df_counts) / (1 + c)) + 1
    source_tf = Counter(source_doc["tokens"])
    source_vec = {t: (source_tf[t] / len(source_doc["tokens"])) * idf.get(t, 1) for t in source_tf}
    source_norm = math.sqrt(sum(v * v for v in source_vec.values())) or 1
    scored: list[dict[str, Any]] = []
    for d in docs:
        if d["url"].lower() == source_url.lower():
            continue
        target_tf = Counter(d["tokens"])
        target_vec = {t: (target_tf[t] / len(d["tokens"])) * idf.get(t, 1) for t in target_tf}
        dot = sum(source_vec.get(t, 0) * target_vec.get(t, 0) for t in set(source_vec) | set(target_vec))
        target_norm = math.sqrt(sum(v * v for v in target_vec.values())) or 1
        sim = dot / (source_norm * target_norm)
        if sim <= 0.05:
            continue
        shared = sorted(set(source_doc["tokens"]) & set(d["tokens"]), key=lambda t: -idf.get(t, 0))[:3]
        anchor_hint = d["title"] or (shared[0] if shared else "related page")
        scored.append({
            "target_url": d["url"],
            "similarity": round(sim, 4),
            "suggested_anchor": anchor_hint[:80],
            "shared_terms": shared,
        })
    scored.sort(key=lambda x: -float(x.get("similarity") or 0))
    limit = parse_limit(args.get("limit"), 5, 10)
    sliced = cap_list(scored, limit, max_cap=10)
    return {
        "url": source_url,
        "suggestions": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Estimated",
    }
