"""Research-backed citability score (0-100) for GEO/AEO.

Based on KDD 2024 (Princeton GEO paper) and AutoGEO ICLR 2026 findings.
Detects high-impact methods from crawl text without external API calls.

Key methods detected:
  - Quotations / cited sources         +20
  - Statistics / numbers               +15
  - Fluency / reading level            +10
  - Front-loading (lead sentence)      +10
  - Lists / tables / enumerations      +10
  - Definition openings                +10
  - FAQ / Q&A schema                   +8
  - Heading hierarchy                  +5
  - External authoritative links       +5
  - Keyword/entity richness            +4
  - Content depth (word count)         +3
"""
from __future__ import annotations

import re
from typing import Any

from psycopg import Connection

from .._slice import _row_schema_types_list
from ..context import AuditToolContext
from ....content_analysis.reading_level import flesch_kincaid_grade


_STAT_PATTERN = re.compile(r"\b\d[\d,]*\.?\d*\s*(?:%|percent|million|billion|thousand|k\b)", re.I)
_CITATION_PATTERN = re.compile(
    r"(?:"
    r'according to|cited by|source:|as reported by|per [A-Z][a-z]+'
    r'|"[^"]{10,}"|'
    r"\[[\d,]+\]"
    r")",
    re.I,
)
_AUTHORITATIVE_DOMAINS = re.compile(
    r"https?://(?:www\.)?"
    r"(?:wikipedia\.org|wikidata\.org|scholar\.google|ncbi\.nlm\.nih\.gov"
    r"|arxiv\.org|pubmed\.ncbi|gov\.|edu\.|bbc\.com|reuters\.com"
    r"|apnews\.com|nytimes\.com|washingtonpost\.com|theguardian\.com"
    r"|nature\.com|sciencedirect\.com)",
    re.I,
)
_QUESTION_PATTERN = re.compile(r"(?:^|\n)\s*(?:what|how|why|when|where|who|which|can|does|is|are)[^\n?]*\?", re.I | re.M)
_TABLE_PATTERN = re.compile(r"<table|<tr|<th|<td|\|\s*[-:]+\s*\|", re.I)
_FRONT_LOAD_PATTERN = re.compile(
    r"^[^.!?\n]{10,200}(?:is|are|means|allows|enables|provides|helps|gives)[^.!?\n]{5,}[.!?]",
    re.I,
)


def _citability_signals(rec: dict[str, Any]) -> dict[str, Any]:
    """Compute per-URL citability signals and score (0-100)."""
    excerpt = str(rec.get("content_excerpt") or "")
    html = str(rec.get("html") or "")
    title = str(rec.get("title") or "")
    h1 = str(rec.get("h1") or "")
    try:
        wc = int(rec.get("word_count") or 0)
    except (TypeError, ValueError):
        wc = 0
    words = excerpt.split()
    lead = " ".join(words[:120])
    excerpt_wc = len(words)

    # --- quotations / cited sources (+20) ---
    quote_matches = len(_CITATION_PATTERN.findall(excerpt))
    authoritative_links = len(_AUTHORITATIVE_DOMAINS.findall(html))
    citation_score = min(20, quote_matches * 4 + authoritative_links * 5)

    # --- statistics / numbers (+15) ---
    stat_matches = len(_STAT_PATTERN.findall(excerpt))
    stats_score = min(15, stat_matches * 3)

    # --- fluency / reading level (+10) ---
    # Guard on excerpt length (not full-page wc): FK needs enough text to be meaningful.
    fk_grade = flesch_kincaid_grade(words, excerpt) if excerpt_wc > 30 else 0.0
    # Optimal FK grade: 8-12 (readable but substantive)
    if 7 <= fk_grade <= 13:
        fluency_score = 10
    elif 5 <= fk_grade <= 15:
        fluency_score = 6
    elif wc > 50:
        fluency_score = 3
    else:
        fluency_score = 0

    # --- front-loading (+10) ---
    has_front_load = bool(_FRONT_LOAD_PATTERN.match(lead.strip()))
    has_definition = bool(re.search(r"\b(is|are|means|refers to|defined as)\b", lead[:400], re.I))
    front_load_score = 10 if has_front_load else (6 if has_definition else 0)

    # --- lists / tables / enumerations (+10) ---
    has_ul_ol = "<li>" in html.lower() or bool(re.search(r"^\s*[-*•]\s", excerpt, re.M))
    has_table = bool(_TABLE_PATTERN.search(html))
    list_score = min(10, (8 if has_ul_ol else 0) + (6 if has_table else 0))

    # --- definition openings (+10) counted above in front_load ---

    # --- FAQ / Q&A schema (+8) ---
    schema_types = [t.lower() for t in _row_schema_types_list(rec)]
    has_faq_schema = any(t in ("faqpage", "qapage", "question") or "faq" in t for t in schema_types)
    has_questions = bool(_QUESTION_PATTERN.search(excerpt))
    faq_score = 8 if has_faq_schema else (4 if has_questions else 0)

    # --- heading hierarchy (+5) ---
    heading_seq = str(rec.get("heading_sequence") or "").lower()
    has_h1_h2 = "h1" in heading_seq and "h2" in heading_seq
    heading_score = 5 if has_h1_h2 else 0

    # --- keyword/entity richness (+4) ---
    keywords = rec.get("top_keywords")
    if isinstance(keywords, str):
        keywords = [keywords]
    entity_count = len(keywords) if isinstance(keywords, list) else 0
    entity_score = min(4, entity_count)

    # --- content depth (+3) ---
    depth_score = 3 if wc >= 600 else (2 if wc >= 300 else (1 if wc >= 150 else 0))

    total = min(100, (
        citation_score
        + stats_score
        + fluency_score
        + front_load_score
        + list_score
        + faq_score
        + heading_score
        + entity_score
        + depth_score
    ))

    return {
        "citability_score": total,
        "signals": {
            "citations_quotes": citation_score,
            "statistics_numbers": stats_score,
            "fluency": fluency_score,
            "front_loading_definition": front_load_score,
            "lists_tables": list_score,
            "faq_qa_schema": faq_score,
            "heading_hierarchy": heading_score,
            "entity_richness": entity_score,
            "content_depth": depth_score,
        },
        "word_count": wc,
        "flesch_kincaid_grade": fk_grade,
        "has_faq_schema": has_faq_schema,
        "has_lists": has_ul_ol,
        "has_table": has_table,
        "authoritative_links": authoritative_links,
        "stat_count": stat_matches,
        "citation_matches": quote_matches,
    }


def get_citability_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Site-wide citability score (0-100) from research-backed signals across all crawled pages."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"citability_score": 0, "total_pages": 0, "provenance": "Estimated", "missing": True}
    scores: list[float] = []
    signal_totals: dict[str, float] = {}
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        result = _citability_signals(rec)
        scores.append(result["citability_score"])
        for k, v in result["signals"].items():
            signal_totals[k] = signal_totals.get(k, 0) + v
    if not scores:
        return {"citability_score": 0, "total_pages": 0, "provenance": "Estimated"}
    avg = round(sum(scores) / len(scores), 1)
    n = len(scores)
    avg_signals = {k: round(v / n, 2) for k, v in signal_totals.items()}
    return {
        "citability_score": avg,
        "total_pages": n,
        "pages_above_50": sum(1 for s in scores if s >= 50),
        "pages_above_75": sum(1 for s in scores if s >= 75),
        "average_signals": avg_signals,
        "provenance": "Estimated",
    }


def get_citability_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Per-URL citability score and detailed signal breakdown."""
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    needle = url.rstrip("/").lower()
    for _, row in df.iterrows():
        rec = row.to_dict()
        if str(rec.get("url") or "").rstrip("/").lower() != needle:
            continue
        result = _citability_signals(rec)
        result["url"] = str(rec.get("url") or "")
        result["title"] = str(rec.get("title") or "")
        result["provenance"] = "Estimated"
        return result
    return {"error": "url not found in crawl", "url": url}
