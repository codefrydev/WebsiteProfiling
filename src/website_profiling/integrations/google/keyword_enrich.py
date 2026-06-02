"""
Keyword enrichment pipeline.

Merges data from:
  - Site crawl keywords (from tools/keywords.py)
  - GSC queries (from google_data table -- no extra API calls)
  - Google Suggest: web + YouTube + question-prefixed
  - Datamuse (optional): semantic expansion
  - Wikipedia (optional): parent topic
  - pytrends (optional): trend direction

Computes:
  - Intent classification (informational / commercial / transactional / navigational)
  - Keyword difficulty proxy
  - Traffic potential per ranking page
  - Cannibalisation detection
  - CTR-curve opportunity score

Writes results to keyword_data + keyword_history tables.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

# Public CTR curve (Advanced Web Ranking 2024 desktop averages)
CTR_CURVE: dict[int, float] = {
    1: 0.278, 2: 0.153, 3: 0.103, 4: 0.073, 5: 0.053,
    6: 0.040, 7: 0.031, 8: 0.025, 9: 0.021, 10: 0.018,
}
CTR_CURVE_DEFAULT = 0.008  # position > 10


def ctr_as_fraction(ctr: Any) -> float:
    """GSC rows use CTR percent (2.8); normalize to fraction for comparisons."""
    if ctr is None:
        return 0.0
    try:
        v = float(ctr)
    except (TypeError, ValueError):
        return 0.0
    return v / 100.0 if v > 1 else v

QUESTION_STARTS = re.compile(
    r"^(how|what|why|when|where|who|can|does|is|are|should|will|do)\s", re.I
)
TRANSACTIONAL_RE = re.compile(
    r"\b(buy|price|cheap|deal|coupon|discount|order|purchase|shop|cost|hire)\b", re.I
)
COMMERCIAL_RE = re.compile(
    r"\b(best|top|review|vs\b|compare|alternative|vs |tool|software|service|agency)\b", re.I
)


# ── Normalization ────────────────────────────────────────────────────────────

def _normalize_kw(kw: str) -> str:
    """Lowercase, strip punctuation, collapse spaces."""
    kw = kw.lower().strip()
    kw = re.sub(r"[^\w\s]", " ", kw)
    kw = re.sub(r"\s+", " ", kw).strip()
    return kw


# ── Intent ────────────────────────────────────────────────────────────────────

def classify_intent(kw: str, brand_name: str = "") -> str:
    if brand_name and brand_name.lower().split()[0] in kw.lower():
        return "navigational"
    if QUESTION_STARTS.match(kw):
        return "informational"
    if TRANSACTIONAL_RE.search(kw):
        return "transactional"
    if COMMERCIAL_RE.search(kw):
        return "commercial"
    return "informational"


def is_question(kw: str) -> bool:
    return bool(QUESTION_STARTS.match(kw.strip()))


def derive_brand_from_start_url(start_url: str) -> str:
    """e.g. https://example.com -> example when brand_name is not set in config."""
    if not start_url:
        return ""
    try:
        from urllib.parse import urlparse

        host = urlparse(start_url.strip()).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        if not host:
            return ""
        label = host.split(".")[0]
        return label if len(label) >= 3 else ""
    except Exception:
        return ""


def resolve_brand_name(cfg: dict[str, Any]) -> str:
    explicit = (cfg.get("brand_name") or "").strip()
    if explicit:
        return explicit
    return derive_brand_from_start_url((cfg.get("start_url") or "").strip())


def is_branded(kw: str, brand_name: str) -> bool:
    if not brand_name:
        return False
    kw_lower = kw.lower()
    brand_words = [w for w in brand_name.lower().split() if len(w) > 2]
    if any(w in kw_lower for w in brand_words):
        return True
    stem = brand_name.lower().replace(" ", "").replace("-", "")
    if len(stem) >= 4 and stem in kw_lower.replace(" ", "").replace("-", ""):
        return True
    return False


# ── Difficulty proxy ──────────────────────────────────────────────────────────

def estimate_difficulty(kw: str, gsc_row: dict | None, branded: bool = False) -> int:
    base = 50
    words = kw.split()
    if len(words) >= 4:
        base -= 20  # long-tail = easier
    elif len(words) == 1:
        base += 15  # single word = harder
    if gsc_row:
        pos = float(gsc_row.get("position") or 100)
        if pos < 5:
            base -= 15  # already ranking high
        elif pos < 20:
            base -= 8
    if branded:
        base -= 20  # branded terms are "easy" for your own site
    return max(0, min(100, base))


# ── CTR curve ─────────────────────────────────────────────────────────────────

def opportunity_clicks(impressions: int, current_pos: float, target_pos: int = 3) -> int:
    cur_ctr = CTR_CURVE.get(round(current_pos), CTR_CURVE_DEFAULT)
    tgt_ctr = CTR_CURVE.get(target_pos, CTR_CURVE.get(3, 0.103))
    return max(0, int((impressions or 0) * (tgt_ctr - cur_ctr)))


def industry_ctr(pos: float) -> float:
    return CTR_CURVE.get(round(pos), CTR_CURVE_DEFAULT)


# ── Cannibalisation ───────────────────────────────────────────────────────────

def detect_cannibalisation(
    gsc_by_page: dict[str, dict],
) -> list[dict[str, Any]]:
    """
    Detect keyword cannibalisation: multiple pages ranking for the same query.
    gsc_by_page: { url: { "queries": [{query, position, clicks, impressions}] } }
    or uses top_queries format merged with by_page.
    """
    # Build query -> [pages] map
    query_pages: dict[str, list[dict]] = {}
    for page_url, page_data in gsc_by_page.items():
        for q in page_data.get("queries", []):
            qtext = str(q.get("query") or "").strip().lower()
            if not qtext:
                continue
            if qtext not in query_pages:
                query_pages[qtext] = []
            query_pages[qtext].append(
                {
                    "url": page_url,
                    "position": q.get("position"),
                    "clicks": q.get("clicks"),
                    "impressions": q.get("impressions"),
                }
            )

    return [
        {
            "query": query,
            "pages": pages,
            "page_count": len(pages),
        }
        for query, pages in query_pages.items()
        if len(pages) > 1
    ]


# ── Traffic potential ─────────────────────────────────────────────────────────

def compute_traffic_potential(
    ranking_page: str | None,
    by_page: dict[str, dict],
) -> int:
    """
    Traffic potential = total impressions of the page that ranks for this keyword.
    """
    if not ranking_page or ranking_page not in by_page:
        return 0
    page = by_page[ranking_page]
    return int(page.get("impressions") or 0)


# ── Main enrichment ───────────────────────────────────────────────────────────

def run_enrichment(
    cfg: dict[str, Any],
) -> dict[str, Any]:
    """
    Full enrichment pipeline. Reads existing data from DB, expands via free APIs,
    computes all derived metrics, writes to keyword_data + keyword_history.
    Returns the enriched data dict.
    """
    from ...db.storage import db_session
    from .keyword_store import (
        write_keyword_data,
        append_keyword_history,
    )
    from .store import read_latest_google_data
    from ..google.suggest import batch_expand

    brand_name = resolve_brand_name(cfg)
    if brand_name:
        print(f"  [Keywords] Brand context: {brand_name}", flush=True)
    enable_suggest = _get_bool(cfg, "enable_google_suggest", False)
    enable_trends = _get_bool(cfg, "enable_google_trends", False)
    enable_wiki = _get_bool(cfg, "enable_wikipedia_topic", False)
    enable_datamuse = _get_bool(cfg, "enable_datamuse", False)
    suggest_top_n = int(cfg.get("keyword_suggest_top_n") or 20)
    max_suggest_results = int(cfg.get("keyword_max_suggest_results") or 8)
    user_seeds_raw = (cfg.get("keyword_seeds") or "").strip()
    user_seeds = [s.strip() for s in user_seeds_raw.split(",") if s.strip()]

    print("  [Keywords] Running enrichment pipeline...", flush=True)

    with db_session() as conn:
        # 1. Load existing GSC data from google_data table
        gsc_queries: dict[str, dict] = {}  # normalized_kw -> {position, impressions, clicks, ctr, url}
        gsc_by_page: dict[str, dict] = {}  # url -> page data
        raw_gsc_full: dict = {}

        google_raw = read_latest_google_data(conn)
        if google_raw:
            # read_latest strips gsc_full/ga4_full -- we need full, so re-read from DB
            pass

        # Re-read with full data
        try:
            cur = conn.execute(
                "SELECT data FROM google_data ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                full_google = json.loads(row[0])
                gsc_full = full_google.get("gsc_full") or {}
                raw_gsc_full = gsc_full
                by_page = gsc_full.get("by_page") or {}
                gsc_by_page = by_page
                # top_queries list -> dict by normalized query
                for q in gsc_full.get("top_queries") or []:
                    nk = _normalize_kw(q.get("query") or "")
                    if nk:
                        gsc_queries[nk] = q
                # Page+query rows (canonical URL per query from GSC)
                for page_url, pdata in by_page.items():
                    for q in pdata.get("queries") or []:
                        nk = _normalize_kw(q.get("query") or "")
                        if not nk:
                            continue
                        imp = int(q.get("impressions") or 0)
                        existing = gsc_queries.get(nk)
                        if not existing:
                            gsc_queries[nk] = {**q, "url": page_url}
                        else:
                            prev_imp = int(existing.get("impressions") or 0)
                            if imp > prev_imp or not existing.get("url"):
                                gsc_queries[nk] = {**existing, **q, "url": page_url}
        except Exception as e:
            print(f"  [Keywords] Warning: could not load GSC data: {e}", flush=True)

        # 2. Load existing site keywords from keyword pipeline
        site_keywords: dict[str, dict] = {}
        try:
            cur = conn.execute(
                "SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                prev = json.loads(row[0])
                for r in prev.get("rows") or []:
                    nk = _normalize_kw(r.get("keyword") or "")
                    if nk:
                        site_keywords[nk] = r
        except Exception:
            pass

        # 3. Build merged keyword index
        all_keywords: dict[str, dict] = {}

        # From site content
        for nk, row in site_keywords.items():
            all_keywords[nk] = {
                **row,
                "sources": list(set(row.get("sources") or ["site"])),
                "gsc_position": None,
                "gsc_impressions": None,
                "gsc_clicks": None,
                "gsc_ctr": None,
                "gsc_url": None,
            }

        # From GSC (add new or merge into existing)
        for nk, qdata in gsc_queries.items():
            kw_text = qdata.get("query") or nk
            if nk in all_keywords:
                existing = all_keywords[nk]
                if "gsc" not in existing["sources"]:
                    existing["sources"].append("gsc")
            else:
                all_keywords[nk] = {
                    "keyword": kw_text,
                    "sources": ["gsc"],
                    "score": 0.0,
                    "relevance": 0.0,
                    "recommended_action": "optimize page",
                }
            all_keywords[nk]["gsc_position"] = qdata.get("position")
            all_keywords[nk]["gsc_impressions"] = qdata.get("impressions")
            all_keywords[nk]["gsc_clicks"] = qdata.get("clicks")
            all_keywords[nk]["gsc_ctr"] = ctr_as_fraction(qdata.get("ctr"))
            all_keywords[nk]["gsc_url"] = qdata.get("url")

        # 4. Suggest expansion
        suggest_results: dict[str, dict] = {}
        if enable_suggest:
            # Seeds: top site keywords + user seeds + brand
            top_site = sorted(
                [r for r in all_keywords.values() if "site" in (r.get("sources") or [])],
                key=lambda r: r.get("score") or 0,
                reverse=True,
            )[:suggest_top_n]
            seeds = [r.get("keyword") or "" for r in top_site if r.get("keyword")]
            seeds = list(dict.fromkeys(seeds + user_seeds + ([brand_name] if brand_name else [])))
            seeds = [s for s in seeds if s.strip()][:suggest_top_n]

            if seeds:
                print(f"  [Keywords] Fetching Suggest for {len(seeds)} seeds...", flush=True)
                suggest_results = batch_expand(
                    seeds,
                    sources=("web", "youtube", "questions"),
                    max_workers=4,
                    cache_conn=conn,
                )
                # Add suggest results to keywords
                for seed, sources_data in suggest_results.items():
                    for src_name, kw_list in sources_data.items():
                        for kw in (kw_list or []):
                            nk = _normalize_kw(kw)
                            if not nk or len(nk) < 3:
                                continue
                            src_tag = "questions" if src_name == "questions" else ("youtube" if src_name == "youtube" else "suggest")
                            if nk in all_keywords:
                                if src_tag not in all_keywords[nk]["sources"]:
                                    all_keywords[nk]["sources"].append(src_tag)
                            else:
                                all_keywords[nk] = {
                                    "keyword": kw.lower(),
                                    "sources": [src_tag],
                                    "score": 0.0,
                                    "relevance": 0.0,
                                    "recommended_action": "create content",
                                    "gsc_position": None,
                                    "gsc_impressions": None,
                                    "gsc_clicks": None,
                                    "gsc_ctr": None,
                                    "gsc_url": None,
                                }

        # 5. Datamuse expansion
        if enable_datamuse:
            from .datamuse import batch_find_related
            top_kws = [r.get("keyword") or "" for r in sorted(
                all_keywords.values(),
                key=lambda r: (r.get("gsc_impressions") or 0),
                reverse=True,
            )[:50] if r.get("keyword")]
            print(f"  [Keywords] Fetching Datamuse for {len(top_kws)} keywords...", flush=True)
            dm_results = batch_find_related(top_kws, max_n=6)
            for seed_kw, dm_data in dm_results.items():
                for related_kw in (dm_data.get("means_like") or []) + (dm_data.get("triggered_by") or []):
                    nk = _normalize_kw(related_kw)
                    if not nk or len(nk) < 3:
                        continue
                    if nk not in all_keywords:
                        all_keywords[nk] = {
                            "keyword": related_kw.lower(),
                            "sources": ["datamuse"],
                            "score": 0.0,
                            "relevance": 0.0,
                            "recommended_action": "create content",
                            "gsc_position": None,
                            "gsc_impressions": None,
                            "gsc_clicks": None,
                            "gsc_ctr": None,
                            "gsc_url": None,
                        }
                    elif "datamuse" not in all_keywords[nk]["sources"]:
                        all_keywords[nk]["sources"].append("datamuse")

        # 6. Wikipedia parent topics (optional)
        wiki_topics: dict[str, Any] = {}
        if enable_wiki:
            from .wiki import batch_find_topics
            top_for_wiki = sorted(
                all_keywords.values(),
                key=lambda r: (r.get("gsc_impressions") or 0) + (r.get("score") or 0) * 1000,
                reverse=True,
            )[:100]
            top_wiki_kws = [r.get("keyword") or "" for r in top_for_wiki if r.get("keyword")]
            print(f"  [Keywords] Fetching Wikipedia topics for {len(top_wiki_kws)} keywords...", flush=True)
            wiki_topics = batch_find_topics(top_wiki_kws, max_n=100)

        # 7. Trends direction (optional)
        trend_directions: dict[str, str | None] = {}
        if enable_trends:
            from .trends import fetch_trend_direction
            trend_kws = [r.get("keyword") or "" for r in sorted(
                all_keywords.values(),
                key=lambda r: (r.get("gsc_impressions") or 0),
                reverse=True,
            )[:50] if r.get("keyword")]
            print(f"  [Keywords] Fetching Trends for {len(trend_kws)} keywords...", flush=True)
            trend_directions = fetch_trend_direction(trend_kws)

        # 8. Cannibalisation detection
        cannibalisation: list[dict] = []
        if gsc_by_page:
            cannibalisation = detect_cannibalisation(gsc_by_page)

        # 9. Compute derived metrics for all keywords
        fetched_at = datetime.now(timezone.utc).isoformat()
        rows: list[dict[str, Any]] = []
        history_rows: list[dict] = []

        for nk, kw_data in all_keywords.items():
            kw_text = kw_data.get("keyword") or nk
            ctr_frac = ctr_as_fraction(kw_data.get("gsc_ctr"))
            gsc_row = {
                "position": kw_data.get("gsc_position"),
                "impressions": kw_data.get("gsc_impressions"),
                "clicks": kw_data.get("gsc_clicks"),
                "ctr": ctr_frac,
            } if kw_data.get("gsc_position") is not None else None

            branded = is_branded(kw_text, brand_name)
            intent = classify_intent(kw_text, brand_name)
            question = is_question(kw_text)
            difficulty = estimate_difficulty(kw_text, gsc_row, branded)

            ranking_page = kw_data.get("gsc_url")
            imps = int(kw_data.get("gsc_impressions") or 0)
            pos = float(kw_data.get("gsc_position") or 0)
            # Traffic potential = real GSC impressions for this query (not page aggregate)
            traffic_potential = imps if gsc_row else 0
            opp_clicks = opportunity_clicks(imps, pos) if pos > 0 else 0
            lost_clicks_flag = (
                pos > 0
                and pos <= 3
                and ctr_frac > 0
                and ctr_frac < industry_ctr(pos) * 0.7
            )

            # Recommended action
            if not gsc_row:
                action = "create content"
            elif lost_clicks_flag:
                action = "improve CTR (title/description)"
            elif 4 <= pos <= 10:
                action = "quick win: push to top 3"
            elif 11 <= pos <= 20:
                action = "quick win: push to page 1"
            elif pos <= 3:
                action = "maintain/improve"
            else:
                action = "optimize page"

            row: dict[str, Any] = {
                "keyword": kw_text,
                "normalized": nk,
                "sources": kw_data.get("sources") or [],
                "intent": intent,
                "is_question": question,
                "is_branded": branded,
                "difficulty": difficulty,
                "gsc_position": kw_data.get("gsc_position"),
                "gsc_impressions": kw_data.get("gsc_impressions"),
                "gsc_clicks": kw_data.get("gsc_clicks"),
                "gsc_ctr": ctr_frac if gsc_row else None,
                "gsc_url": ranking_page,
                "traffic_potential": traffic_potential,
                "opportunity_clicks": opp_clicks,
                "lost_clicks": lost_clicks_flag,
                "trend": trend_directions.get(kw_text),
                "parent_topic": wiki_topics.get(kw_text, {}).get("topic") if wiki_topics.get(kw_text) else None,
                "recommended_action": action,
                "score": float(kw_data.get("score") or 0),
                "relevance": float(kw_data.get("relevance") or 0),
                "site_sources_count": int(kw_data.get("sources_count") or 0),
            }
            rows.append(row)

            # History tracking for GSC keywords
            if gsc_row:
                history_rows.append({
                    "keyword": kw_text,
                    "fetched_at": fetched_at,
                    "position": kw_data.get("gsc_position"),
                    "clicks": kw_data.get("gsc_clicks"),
                    "impressions": kw_data.get("gsc_impressions"),
                    "ctr": ctr_frac,
                })

        # Sort by traffic potential + impressions + site score
        rows.sort(
            key=lambda r: (
                r.get("traffic_potential") or 0,
                r.get("gsc_impressions") or 0,
                r.get("score") or 0,
            ),
            reverse=True,
        )

        data_blob = {
            "fetched_at": fetched_at,
            "brand_name": brand_name,
            "total_keywords": len(rows),
            "gsc_keyword_count": sum(1 for r in rows if "gsc" in (r.get("sources") or [])),
            "suggest_count": sum(1 for r in rows if "suggest" in (r.get("sources") or []) or "youtube" in (r.get("sources") or []) or "questions" in (r.get("sources") or [])),
            "cannibalisation": cannibalisation[:50],
            "cannibalisation_count": len(cannibalisation),
            "rows": rows,
        }

        write_keyword_data(conn, data_blob)
        if history_rows:
            append_keyword_history(conn, history_rows)

        print(
            f"  [Keywords] Enrichment done: {len(rows)} keywords "
            f"({data_blob['gsc_keyword_count']} from GSC, "
            f"{data_blob['suggest_count']} from Suggest). "
            f"{len(cannibalisation)} cannibalisation issues.",
            flush=True,
        )
        return data_blob


def _get_bool(cfg: dict, key: str, default: bool = False) -> bool:
    v = str(cfg.get(key, str(default))).strip().lower()
    return v in ("1", "true", "yes", "on")
