"""Advanced GEO/AEO detectors: negative signals, prompt injection, RAG chunks,
content decay, multimodal readiness, and topic authority clustering.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Any
from urllib.parse import urlparse

from psycopg import Connection

from ._slice import _row_schema_types_list, cap_list, parse_limit
from .context import AuditToolContext

# ---------------------------------------------------------------------------
# Negative signals detection
# ---------------------------------------------------------------------------

_AFFILIATE_PATTERN = re.compile(r"(?:affiliate|partner|ref=|aff_id=|click_id=)", re.I)
_BOILERPLATE_PATTERN = re.compile(
    r"\b(?:home|about|contact|privacy policy|terms of service|cookie policy|all rights reserved)\b",
    re.I,
)


def _check_negative_signals_for_page(rec: dict[str, Any]) -> list[dict[str, Any]]:
    html = str(rec.get("html") or "")
    excerpt = str(rec.get("content_excerpt") or "")
    try:
        wc = int(rec.get("word_count") or 0)
    except (TypeError, ValueError):
        wc = 0
    url = str(rec.get("url") or "")
    path = urlparse(url).path.lower()
    is_homepage = path in ("/", "")
    signals: list[dict[str, Any]] = []

    # CTA overload
    cta_count = len(re.findall(r"\b(?:buy now|sign up|get started|subscribe|click here|download now|free trial)\b", html, re.I))
    if cta_count >= 4:
        signals.append({"signal": "cta_overload", "detail": f"{cta_count} CTA instances"})

    # Thin content
    if wc < 150 and not is_homepage and wc > 0:
        signals.append({"signal": "thin_content", "detail": f"{wc} words"})

    # Keyword stuffing
    words = re.findall(r"\b[a-z]{4,}\b", excerpt.lower())
    if words:
        counter = Counter(words)
        top_word, top_count = counter.most_common(1)[0]
        if top_count >= 8 and top_count / len(words) > 0.05:
            signals.append({"signal": "keyword_stuffing", "detail": f"'{top_word}' appears {top_count}x"})

    # Popup patterns
    if re.search(r'class=["\'][^"\']*(?:popup|modal|overlay|lightbox)[^"\']*["\']', html, re.I):
        signals.append({"signal": "popup_overlay", "detail": "Modal/popup class detected in HTML"})

    # Missing author on article pages
    schema_types = [t.lower() for t in _row_schema_types_list(rec)]
    is_article = any(t in ("article", "newsarticle", "blogposting") for t in schema_types)
    author_present = bool(re.search(r'(?:itemprop=["\']author["\']|class=["\'][^"\']*author[^"\']*["\']|<author)', html, re.I))
    if is_article and not author_present:
        signals.append({"signal": "missing_author", "detail": "Article schema without author attribution"})

    # No structural content on long pages
    has_heading = bool(re.search(r"<h[1-6]", html, re.I))
    has_list = "<li>" in html.lower()
    if wc >= 500 and not has_heading and not has_list:
        signals.append({"signal": "no_structured_content", "detail": f"{wc} words, no headings or lists"})

    # Affiliate/tracking link overload
    affiliate_count = len(_AFFILIATE_PATTERN.findall(html))
    if affiliate_count >= 6:
        signals.append({"signal": "affiliate_overload", "detail": f"{affiliate_count} affiliate/tracking patterns"})

    # Boilerplate ratio: nav/footer keywords dominate short pages
    if wc and wc < 400:
        boilerplate_count = len(_BOILERPLATE_PATTERN.findall(excerpt))
        if boilerplate_count >= 4:
            signals.append({"signal": "boilerplate_ratio", "detail": f"{boilerplate_count} boilerplate phrases on thin page"})

    return signals


def get_negative_signals(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Detect 7 anti-citation negative signals across crawled pages."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "provenance": "Estimated", "missing": True}
    flagged: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        signals = _check_negative_signals_for_page(rec)
        if signals:
            flagged.append({
                "url": str(rec.get("url") or ""),
                "title": str(rec.get("title") or ""),
                "signals": signals,
                "signal_count": len(signals),
            })
    flagged.sort(key=lambda p: -p["signal_count"])
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(flagged, limit, max_cap=50)
    signal_summary: dict[str, int] = {}
    for page in flagged:
        for sig in page["signals"]:
            k = sig["signal"]
            signal_summary[k] = signal_summary.get(k, 0) + 1
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "signal_summary": signal_summary,
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Prompt injection detection
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("hidden_text", re.compile(r'style=["\'][^"\']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"\']*["\']', re.I)),
    ("invisible_unicode", re.compile(r"[\u200b\u200c\u200d\u00ad\ufeff\u2060]")),
    ("micro_font", re.compile(r'(?:font-size\s*:\s*[01]px|font-size\s*:\s*0\.)', re.I)),
    ("monochrome_text", re.compile(r'color\s*:\s*(?:#fff{3,6}|white|#000{3,6}|black)\s*;[^}]*background(?:-color)?\s*:\s*(?:#fff{3,6}|white|#000{3,6}|black)', re.I)),
    ("html_comment_injection", re.compile(r"<!--[^-]{50,}-->", re.S)),
    ("aria_hidden_abuse", re.compile(r'aria-hidden=["\']true["\'][^>]*>[^<]{30,}</\w+>', re.I)),
    ("data_attr_injection", re.compile(r'data-(?:llm|ai|gpt|prompt)[^=]*=["\'][^"\']{20,}["\']', re.I)),
    ("llm_instruction_text", re.compile(
        r"(?:ignore (?:previous|prior|all) (?:instructions?|prompts?)|"
        r"you are now|act as|roleplay as|pretend (?:you are|to be)|"
        r"system prompt|disregard (?:your|the) (?:guidelines?|rules?|instructions?))",
        re.I,
    )),
]


def detect_prompt_injection(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Detect 8 prompt-injection and content-manipulation patterns in crawled HTML."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "provenance": "Estimated", "missing": True}
    flagged: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        html = str(rec.get("html") or "")
        if not html:
            continue
        found: list[dict[str, Any]] = []
        for pattern_name, pattern in _INJECTION_PATTERNS:
            match = pattern.search(html)
            if match:
                found.append({"pattern": pattern_name, "excerpt": html[max(0, match.start() - 30):match.end() + 30][:120]})
        if found:
            flagged.append({
                "url": str(rec.get("url") or ""),
                "title": str(rec.get("title") or ""),
                "patterns": found,
                "pattern_count": len(found),
            })
    flagged.sort(key=lambda p: -p["pattern_count"])
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(flagged, limit, max_cap=50)
    pattern_summary: dict[str, int] = {}
    for page in flagged:
        for p in page["patterns"]:
            k = p["pattern"]
            pattern_summary[k] = pattern_summary.get(k, 0) + 1
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "pattern_summary": pattern_summary,
        "severity": "high" if flagged else "none",
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# RAG chunk readiness
# ---------------------------------------------------------------------------

_MIN_SECTION_WORDS = 100
_ANCHOR_SENTENCE_PATTERN = re.compile(
    r"^[A-Z][^.!?]{20,120}(?:is|are|provides?|enables?|allows?|helps?|means?)[^.!?]{10,}[.!?]",
    re.M,
)


def get_rag_chunk_readiness(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Score RAG retrieval readiness: section sizes, heading boundaries, anchor sentences."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "provenance": "Estimated", "missing": True}
    results: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        excerpt = str(rec.get("content_excerpt") or "")
        html = str(rec.get("html") or "")
        heading_seq = str(rec.get("heading_sequence") or "").lower()
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        has_h2 = "h2" in heading_seq
        has_h3 = "h3" in heading_seq
        section_boundaries = len(re.findall(r"<h[2-4][^>]*>", html, re.I))
        approx_section_wc = wc // max(1, section_boundaries) if section_boundaries else wc
        has_anchor_sentence = bool(_ANCHOR_SENTENCE_PATTERN.search(excerpt))
        rag_score = 0
        if wc >= 200:
            rag_score += 20
        if has_h2:
            rag_score += 25
        if section_boundaries >= 2:
            rag_score += 20
        if _MIN_SECTION_WORDS <= approx_section_wc <= 600:
            rag_score += 20
        if has_anchor_sentence:
            rag_score += 15
        results.append({
            "url": str(rec.get("url") or ""),
            "title": str(rec.get("title") or ""),
            "rag_score": rag_score,
            "word_count": wc,
            "section_count": section_boundaries,
            "approx_section_word_count": approx_section_wc,
            "has_anchor_sentence": has_anchor_sentence,
            "has_heading_boundaries": has_h2 or has_h3,
        })
    results.sort(key=lambda p: -p["rag_score"])
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(results, limit, max_cap=50)
    total_pages = len(results)
    avg_rag = round(sum(r["rag_score"] for r in results) / total_pages, 1) if total_pages else 0
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "average_rag_score": avg_rag,
        "pages_above_60": sum(1 for r in results if r["rag_score"] >= 60),
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Content decay detection
# ---------------------------------------------------------------------------

_TEMPORAL_DECAY = re.compile(
    r"\b(?:in \d{4}|last year|this year|currently|as of \d{4}|recent(?:ly)?|now|today|latest)\b",
    re.I,
)
_STAT_DECAY = re.compile(
    r"\b\d[\d,]*\.?\d*\s*(?:%|percent|million|billion)\b",
    re.I,
)
_VERSION_DECAY = re.compile(r"\bv(?:ersion)?\s*\d+\.\d+|\b\d{4}\s+version\b", re.I)
_EVENT_DECAY = re.compile(r"\b(?:conference|summit|launch|release|event)\s+\d{4}\b", re.I)
_PRICE_DECAY = re.compile(r"\$\s*\d[\d,.]*|\b\d+\s*(?:dollars?|usd|eur|gbp)\b", re.I)


def get_content_decay_signals(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Detect temporal, statistical, version, event, and price decay patterns in crawled content."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "provenance": "Estimated", "missing": True}
    results: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        excerpt = str(rec.get("content_excerpt") or "")
        if not excerpt:
            continue
        temporal = len(_TEMPORAL_DECAY.findall(excerpt))
        stats = len(_STAT_DECAY.findall(excerpt))
        versions = len(_VERSION_DECAY.findall(excerpt))
        events = len(_EVENT_DECAY.findall(excerpt))
        prices = len(_PRICE_DECAY.findall(excerpt))
        total_decay = temporal + stats + versions + events + prices
        evergreen_score = max(0, 100 - temporal * 5 - stats * 2 - versions * 8 - events * 10 - prices * 3)
        decay_types: list[str] = []
        if temporal:
            decay_types.append("temporal")
        if stats:
            decay_types.append("statistical")
        if versions:
            decay_types.append("version")
        if events:
            decay_types.append("event")
        if prices:
            decay_types.append("price")
        results.append({
            "url": str(rec.get("url") or ""),
            "title": str(rec.get("title") or ""),
            "evergreen_score": evergreen_score,
            "decay_types": decay_types,
            "decay_signal_count": total_decay,
            "temporal_mentions": temporal,
            "stat_mentions": stats,
            "version_mentions": versions,
            "event_mentions": events,
            "price_mentions": prices,
        })
    results.sort(key=lambda p: p["evergreen_score"])
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(results, limit, max_cap=50)
    total_pages = len(results)
    avg_ev = round(sum(r["evergreen_score"] for r in results) / total_pages, 1) if total_pages else 0
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "average_evergreen_score": avg_ev,
        "pages_at_risk": sum(1 for r in results if r["evergreen_score"] < 60),
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Multimodal readiness
# ---------------------------------------------------------------------------

def get_multimodal_readiness(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check image alt coverage, VideoObject/AudioObject schema, transcript/subtitle signals."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "provenance": "Estimated", "missing": True}
    total = 0
    good_alt = 0
    has_video_schema = 0
    has_audio_schema = 0
    has_transcript = 0
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        total += 1
        html = str(rec.get("html") or "")
        schema_types = [t.lower() for t in _row_schema_types_list(rec)]
        images = re.findall(r"<img[^>]+>", html, re.I)
        total_imgs = len(images)
        imgs_with_alt = sum(1 for img in images if re.search(r'alt=["\'][^"\']{3,}["\']', img, re.I))
        if total_imgs == 0 or (total_imgs > 0 and imgs_with_alt / total_imgs >= 0.8):
            good_alt += 1
        if any(t in ("videoobject", "videogallery") for t in schema_types):
            has_video_schema += 1
        if any(t in ("audioobject",) for t in schema_types):
            has_audio_schema += 1
        if re.search(r'(?:transcript|subtitle|caption|webvtt|\.srt\b)', html, re.I):
            has_transcript += 1
    mm_score = 0
    if total:
        mm_score = round(
            (good_alt / total) * 40
            + (has_video_schema / total) * 20
            + (has_audio_schema / total) * 10
            + (has_transcript / total) * 30,
            1,
        )
    return {
        "multimodal_readiness_score": min(100, mm_score),
        "total_pages": total,
        "pages_with_good_alt_coverage": good_alt,
        "pages_with_video_schema": has_video_schema,
        "pages_with_audio_schema": has_audio_schema,
        "pages_with_transcript_signals": has_transcript,
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Topic authority clustering
# ---------------------------------------------------------------------------

def _simple_tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]{4,}", text.lower())


def get_topic_authority(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Multi-page entity clusters and pillar/pillar-support detection using TF-IDF."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"clusters": [], "total_pages": 0, "provenance": "Estimated", "missing": True}

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
        tokens = _simple_tokenize(text)
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        if tokens:
            docs.append({
                "url": url,
                "title": str(rec.get("title") or ""),
                "tokens": tokens,
                "word_count": wc,
            })

    if len(docs) < 2:
        return {"clusters": [], "total_pages": len(docs), "provenance": "Estimated", "note": "insufficient pages"}

    # Cap at 200 pages to keep the O(n²) cosine clustering fast (<1 s).
    # Prefer the highest word-count pages — they're most representative.
    _MAX_CLUSTER_DOCS = 200
    if len(docs) > _MAX_CLUSTER_DOCS:
        docs = sorted(docs, key=lambda d: -d["word_count"])[:_MAX_CLUSTER_DOCS]

    # IDF
    n = len(docs)
    doc_freq: Counter[str] = Counter()
    for d in docs:
        for t in set(d["tokens"]):
            doc_freq[t] += 1
    idf: dict[str, float] = {t: math.log((1 + n) / (1 + c)) + 1 for t, c in doc_freq.items()}

    def tfidf_vec(tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        total = len(tokens) or 1
        return {t: (tf[t] / total) * idf.get(t, 1) for t in tf}

    vecs = [tfidf_vec(d["tokens"]) for d in docs]

    def cosine(a: dict[str, float], b: dict[str, float]) -> float:
        dot = sum(a.get(t, 0) * b.get(t, 0) for t in set(a) | set(b))
        na = math.sqrt(sum(v * v for v in a.values())) or 1
        nb = math.sqrt(sum(v * v for v in b.values())) or 1
        return dot / (na * nb)

    # Simple greedy clustering: each doc joins the cluster of its most similar neighbor
    cluster_id: list[int] = list(range(n))
    merged = True
    threshold = 0.25
    for _ in range(3):
        if not merged:
            break
        merged = False
        for i in range(n):
            best_j, best_sim = -1, threshold
            for j in range(n):
                if i == j:
                    continue
                sim = cosine(vecs[i], vecs[j])
                if sim > best_sim:
                    best_sim = sim
                    best_j = j
            if best_j >= 0 and cluster_id[best_j] != cluster_id[i]:
                old = cluster_id[i]
                new_id = cluster_id[best_j]
                for k in range(n):
                    if cluster_id[k] == old:
                        cluster_id[k] = new_id
                merged = True

    # Group docs by cluster
    groups: dict[int, list[int]] = defaultdict(list)
    for i, cid in enumerate(cluster_id):
        groups[cid].append(i)

    clusters: list[dict[str, Any]] = []
    for cid, members in sorted(groups.items(), key=lambda x: -len(x[1])):
        if len(members) < 2:
            continue
        cluster_docs = [docs[i] for i in members]
        all_tokens: list[str] = []
        for d in cluster_docs:
            all_tokens.extend(d["tokens"])
        top_terms = [t for t, _ in Counter(all_tokens).most_common(5) if idf.get(t, 1) < 3.0]
        pillar = max(cluster_docs, key=lambda d: d["word_count"])
        clusters.append({
            "cluster_id": cid,
            "page_count": len(members),
            "top_terms": top_terms,
            "pillar_url": pillar["url"],
            "pillar_title": pillar["title"],
            "pages": [{"url": d["url"], "title": d["title"]} for d in cluster_docs[:10]],
        })

    authority_score = min(100, round(len(clusters) * 10 + (n / max(1, len(clusters))) * 2))

    limit = parse_limit(args.get("limit"), 10, 20)
    sliced = cap_list(clusters, limit, max_cap=20)
    return {
        "clusters": sliced["items"],
        "total_clusters": sliced["total"],
        "truncated": sliced["truncated"],
        "total_pages": n,
        "topic_authority_score": authority_score,
        "provenance": "Estimated",
    }
