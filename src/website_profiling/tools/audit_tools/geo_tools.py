"""GEO/AEO readiness tools: llms.txt, FAQ schema, citation signals, internal link suggestions."""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from psycopg import Connection

from ._slice import _parse_page_analysis, _row_schema_types_list, cap_list, parse_limit
from .context import AuditToolContext

_FAQ_TYPES = frozenset({"faqpage", "qapage", "question"})
_QA_URL_HINTS = ("/faq", "/faqs", "/help", "/support", "/questions")


def _fetch_llms_txt(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found": False, "error": "domain unknown"}
    base = f"https://{domain.lstrip('https://').lstrip('http://').split('/')[0]}"
    paths = ("/llms.txt", "/.well-known/llms.txt")
    for path in paths:
        url = urljoin(base + "/", path.lstrip("/"))
        try:
            resp = requests.get(url, timeout=8, headers={"User-Agent": "SiteAudit/1.0"})
            if resp.status_code == 200 and resp.text.strip():
                return {
                    "found": True,
                    "url": url,
                    "status_code": resp.status_code,
                    "size_bytes": len(resp.content),
                    "preview": resp.text.strip()[:500],
                }
        except requests.RequestException:
            continue
    return {"found": False, "checked_urls": [urljoin(base, p) for p in paths]}


def get_llms_txt_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_llms_txt(domain)
    result["domain"] = domain
    result["provenance"] = "Crawl"
    return result


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


def get_geo_readiness_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    df = scoped.load_crawl_df(conn)
    components: dict[str, float] = {}
    total_2xx = 0
    schema_pages = 0
    good_word_count = 0
    good_headings = 0
    if df is not None and not df.empty:
        for _, row in df.iterrows():
            rec = row.to_dict()
            if not str(rec.get("status") or "").startswith("2"):
                continue
            total_2xx += 1
            if _row_schema_types_list(rec) or str(rec.get("has_schema") or "").lower() in ("true", "1", "yes"):
                schema_pages += 1
            try:
                wc = int(rec.get("word_count") or 0)
            except (TypeError, ValueError):
                wc = 0
            if wc >= 300:
                good_word_count += 1
            seq = str(rec.get("heading_sequence") or "")
            if seq and "h1" in seq.lower() and "h2" in seq.lower():
                good_headings += 1
    if total_2xx:
        components["schema_coverage"] = round(schema_pages / total_2xx * 100, 1)
        components["substantive_content"] = round(good_word_count / total_2xx * 100, 1)
        components["heading_structure"] = round(good_headings / total_2xx * 100, 1)
    else:
        components["schema_coverage"] = 0
        components["substantive_content"] = 0
        components["heading_structure"] = 0
    faq = get_faq_schema_coverage(conn, scoped, args)
    components["faq_schema_coverage"] = float(faq.get("coverage_pct") or 0)
    ner = payload.get("ner_site_summary") if isinstance(payload.get("ner_site_summary"), dict) else {}
    entities = ner.get("entities") or ner.get("top_entities") or []
    entity_count = len(entities) if isinstance(entities, list) else 0
    components["entity_richness"] = min(100.0, entity_count * 5.0)
    llms = _fetch_llms_txt(scoped.resolve_property_domain(conn))
    components["llms_txt_present"] = 100.0 if llms.get("found") else 0.0
    score = round(
        components["schema_coverage"] * 0.2
        + components["substantive_content"] * 0.2
        + components["heading_structure"] * 0.15
        + components["faq_schema_coverage"] * 0.15
        + components["entity_richness"] * 0.15
        + components["llms_txt_present"] * 0.15,
        1,
    )
    return {
        "geo_readiness_score": score,
        "components": components,
        "provenance": "Estimated",
    }


def get_aeo_content_signals_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    needle = url.rstrip("/").lower()
    for _, row in df.iterrows():
        if str(row.get("url") or "").rstrip("/").lower() != needle:
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


def get_js_rendering_delta(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty or "fetch_method" not in df.columns:
        return {"deltas": [], "total": 0, "note": "fetch_method not in crawl — use javascript or auto render mode"}
    by_url: dict[str, dict[str, dict[str, Any]]] = {}
    for _, row in df.iterrows():
        url = str(row.get("url") or "").rstrip("/").lower()
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
    source_doc = next((d for d in docs if d["url"].rstrip("/").lower() == source_url.rstrip("/").lower()), None)
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
        if d["url"].rstrip("/").lower() == source_url.rstrip("/").lower():
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
