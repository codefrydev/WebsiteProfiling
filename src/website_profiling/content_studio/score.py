"""Content Studio scoring from GSC keywords and on-page heuristics.

The score mirrors the workflow of a content-optimization editor (Clearscope-style):
a target keyword expands into a set of related *terms*, each with a recommended
usage *count*; the draft is graded on how well it covers those terms at the right
frequency, plus on-page structure and readability. Term data is sourced from
Search Console (real queries the property already shows for) — not live SERP
scraping — so the grade is honestly "estimated", never a competitor crawl.
"""
from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

from ..content_analysis.reading_level import flesch_kincaid_grade
from ..content_analysis.text_extract import extract_text
from ..content_analysis.tokenize import count_words, tokenize_words
from ..db import db_session
from ..integrations.google.keyword_store import read_latest_keyword_data

PROVENANCE = "Search Console + on-site heuristics"

_WORD_COUNT_MIN = 600
_WORD_COUNT_TARGET = 1200
_WORD_COUNT_MAX = 2500

# Flesch–Kincaid grade we treat as broadly readable; above this we nudge to simplify.
_READING_GRADE_TARGET = 12.0
_READING_GRADE_MAX = 14.0
# Below this word count, readability can't be measured meaningfully.
_READING_MIN_WORDS = 80

# How many leading words count as the "intro" for keyword-placement checks.
_INTRO_WORDS = 100

# Matching tokens: lowercase alphanumeric runs (word-boundary aware) so that a
# term like "ai" never spuriously matches "br[ai]n" or "expl[ai]ned".
_MATCH_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Words ignored when deciding whether a multi-word phrase is "partially" covered
# or whether the keyword appears in the title/H1/intro.
_STOPWORDS = frozenset(
    {
        "a", "an", "and", "the", "of", "for", "to", "in", "on", "or", "is",
        "are", "be", "with", "your", "you", "how", "what", "why", "vs",
    }
)

# Fine-grained grade bands (high → low). Mirrors a Clearscope-style A++…F scale so
# small improvements are visible instead of being flattened into five buckets.
_GRADE_BANDS: list[tuple[int, str]] = [
    (97, "A++"),
    (93, "A+"),
    (90, "A"),
    (87, "A-"),
    (83, "B+"),
    (80, "B"),
    (77, "B-"),
    (73, "C+"),
    (70, "C"),
    (67, "C-"),
    (63, "D+"),
    (60, "D"),
    (57, "D-"),
]


def _grade_label(score: int) -> str:
    for threshold, label in _GRADE_BANDS:
        if score >= threshold:
            return label
    return "F"


def _normalize_url(url: str) -> str:
    return (url or "").strip().lower().rstrip("/")


def _match_tokens(text: str) -> list[str]:
    return _MATCH_TOKEN_RE.findall((text or "").lower())


def _phrase_count(needle: list[str], haystack: list[str]) -> int:
    """Count non-overlapping contiguous occurrences of ``needle`` within ``haystack``."""
    n, m = len(haystack), len(needle)
    if m == 0 or m > n:
        return 0
    count = 0
    i = 0
    while i <= n - m:
        if haystack[i : i + m] == needle:
            count += 1
            i += m
        else:
            i += 1
    return count


def _significant_words(term_tokens: list[str]) -> list[str]:
    """Content words of a phrase (drop short/stop words), falling back to all tokens."""
    sig = [w for w in term_tokens if len(w) >= 3 and w not in _STOPWORDS]
    return sig or term_tokens


def _html_to_text(html: str) -> str:
    if not html or not html.strip():
        return ""
    soup = BeautifulSoup(html, "html.parser")
    return extract_text(soup)


def _count_h1(html: str) -> int:
    if not html:
        return 0
    soup = BeautifulSoup(html, "html.parser")
    return len(soup.find_all("h1"))


def _first_h1_text(html: str) -> str:
    if not html or not html.strip():
        return ""
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    return h1.get_text(separator=" ", strip=True) if h1 else ""


def _term_match(term: str, corpus_tokens: list[str], corpus_set: set[str]) -> tuple[str, int]:
    """Return (status, count) for a term against tokenized corpus.

    ``included`` → the exact phrase occurs ``count`` times.
    ``partial``  → (multi-word only) every significant word appears, but not as a phrase.
    ``missing``  → otherwise.
    """
    term_tokens = _match_tokens(term)
    if not term_tokens:
        return "missing", 0
    count = _phrase_count(term_tokens, corpus_tokens)
    if count > 0:
        return "included", count
    if len(term_tokens) > 1 and all(w in corpus_set for w in _significant_words(term_tokens)):
        return "partial", 0
    return "missing", 0


def _term_in_corpus(term: str, corpus: str) -> str:
    """Status (included | partial | missing) for a term against corpus text."""
    tokens = _match_tokens(corpus)
    status, _ = _term_match(term, tokens, set(tokens))
    return status


def _term_target(term: str, importance: str) -> int:
    """Recommended occurrence count for a term (stable, independent of current length)."""
    if len(_match_tokens(term)) >= 3:
        return 1  # long phrases: a single natural mention is enough
    return 3 if importance == "high" else 2


def _keyword_present(keyword: str, text: str) -> bool:
    """True if the keyword appears as a phrase, or all its content words appear."""
    kw_tokens = _match_tokens(keyword)
    if not kw_tokens:
        return False
    text_tokens = _match_tokens(text)
    if _phrase_count(kw_tokens, text_tokens) > 0:
        return True
    text_set = set(text_tokens)
    return all(w in text_set for w in _significant_words(kw_tokens))


def _title_check(title_tag: str) -> dict[str, Any]:
    n = len((title_tag or "").strip())
    if n == 0:
        return {"id": "title_length", "pass": False, "hint": "Add a title tag (aim for 50–60 characters)."}
    if n < 30:
        return {"id": "title_length", "pass": False, "hint": f"Title is short ({n} chars); aim for 50–60."}
    if n > 70:
        return {"id": "title_length", "pass": False, "hint": f"Title is long ({n} chars); aim for 50–60."}
    return {"id": "title_length", "pass": True, "hint": f"Title length OK ({n} chars)."}


def _meta_check(meta: str) -> dict[str, Any]:
    n = len((meta or "").strip())
    if n == 0:
        return {"id": "meta_length", "pass": False, "hint": "Add a meta description (aim for 120–160 characters)."}
    if n < 70:
        return {"id": "meta_length", "pass": False, "hint": f"Meta description is short ({n} chars); aim for 120–160."}
    if n > 170:
        return {"id": "meta_length", "pass": False, "hint": f"Meta description is long ({n} chars); aim for 120–160."}
    return {"id": "meta_length", "pass": True, "hint": f"Meta description length OK ({n} chars)."}


def _h1_check(html: str) -> dict[str, Any]:
    n = _count_h1(html)
    if n == 0:
        return {"id": "h1_single", "pass": False, "hint": "Add exactly one H1 in the body."}
    if n > 1:
        return {"id": "h1_single", "pass": False, "hint": f"Found {n} H1 tags; use exactly one."}
    return {"id": "h1_single", "pass": True, "hint": "Single H1 present."}


def _word_count_check(word_count: int) -> dict[str, Any]:
    if word_count < _WORD_COUNT_MIN:
        return {
            "id": "word_count",
            "pass": False,
            "hint": f"Content is thin ({word_count} words); aim for {_WORD_COUNT_MIN}–{_WORD_COUNT_MAX}.",
        }
    if word_count > _WORD_COUNT_MAX:
        return {
            "id": "word_count",
            "pass": False,
            "hint": f"Content is very long ({word_count} words); consider tightening.",
        }
    return {"id": "word_count", "pass": True, "hint": f"Word count in range ({word_count} words)."}


def _keyword_in_title_check(keyword: str, title_tag: str) -> dict[str, Any]:
    if _keyword_present(keyword, title_tag):
        return {"id": "keyword_in_title", "pass": True, "hint": "Target keyword appears in the title tag."}
    return {"id": "keyword_in_title", "pass": False, "hint": "Add the target keyword to the title tag."}


def _keyword_in_h1_check(keyword: str, html: str) -> dict[str, Any]:
    h1_text = _first_h1_text(html)
    if h1_text and _keyword_present(keyword, h1_text):
        return {"id": "keyword_in_h1", "pass": True, "hint": "Target keyword appears in the H1."}
    return {"id": "keyword_in_h1", "pass": False, "hint": "Work the target keyword into the H1 heading."}


def _keyword_in_intro_check(keyword: str, body_text: str) -> dict[str, Any]:
    intro = " ".join((body_text or "").split()[:_INTRO_WORDS])
    if intro and _keyword_present(keyword, intro):
        return {"id": "keyword_in_intro", "pass": True, "hint": "Target keyword appears in the opening paragraph."}
    return {
        "id": "keyword_in_intro",
        "pass": False,
        "hint": f"Mention the target keyword within the first {_INTRO_WORDS} words.",
    }


def _reading_level_check(reading_level: float, word_count: int) -> dict[str, Any]:
    if word_count < _READING_MIN_WORDS:
        return {"id": "reading_level", "pass": False, "hint": "Add more content to assess readability."}
    if reading_level > _READING_GRADE_MAX:
        return {
            "id": "reading_level",
            "pass": False,
            "hint": f"Reading level is high (grade {reading_level}); shorten sentences for a broader audience.",
        }
    return {"id": "reading_level", "pass": True, "hint": f"Reading level is accessible (grade {reading_level})."}


def _collect_gsc_terms(
    keyword: str,
    landing_url: str | None,
    rows: list[dict[str, Any]],
    *,
    cap: int = 25,
) -> list[dict[str, Any]]:
    """Build ranked term list from GSC keyword rows."""
    kw_lower = (keyword or "").strip().lower()
    landing_norm = _normalize_url(landing_url or "")
    seen: set[str] = set()
    terms: list[dict[str, Any]] = []

    def add(term: str, importance: str, source: str, impressions: int = 0) -> None:
        t = (term or "").strip()
        if not t or len(t) < 2:
            return
        key = t.lower()
        if key in seen:
            return
        seen.add(key)
        terms.append({
            "term": t,
            "importance": importance,
            "source": source,
            "_impressions": impressions,
        })

    if kw_lower:
        add(keyword.strip(), "high", "keyword", 10_000)

    # Content words of the keyword drive topical relatedness (e.g. "crm" links
    # "best crm" to "crm software"). Empty for all-stopword keywords, in which
    # case we fall back to substring/URL matching only.
    kw_content_words = {w for w in _match_tokens(keyword) if len(w) >= 3 and w not in _STOPWORDS}

    scored_rows: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        q = str(row.get("keyword") or "").strip()
        if not q:
            continue
        imps = int(row.get("gsc_impressions") or 0)
        gsc_url = _normalize_url(str(row.get("gsc_url") or ""))
        q_lower = q.lower()
        related = (
            kw_lower in q_lower
            or q_lower in kw_lower
            or bool(kw_content_words & set(_match_tokens(q)))
            or (landing_norm and landing_norm in gsc_url)
        )
        if related:
            scored_rows.append((imps, row))

    scored_rows.sort(key=lambda x: -x[0])
    for imps, row in scored_rows[:cap]:
        q = str(row.get("keyword") or "").strip()
        importance = "high" if imps >= 100 or q.lower() == kw_lower else "medium"
        add(q, importance, "gsc", imps)

    terms.sort(key=lambda t: (-(2 if t["importance"] == "high" else 1), -t["_impressions"]))
    for t in terms:
        t.pop("_impressions", None)
    return terms[:cap]


def _term_coverage_score(terms: list[dict[str, Any]]) -> float:
    """Frequency-aware coverage: each term earns credit up to its target count."""
    if not terms:
        return 0.5
    total_weight = 0.0
    earned = 0.0
    for t in terms:
        w = 2.0 if t.get("importance") == "high" else 1.0
        total_weight += w
        count = int(t.get("count") or 0)
        target = max(1, int(t.get("target") or 1))
        if count > 0:
            frac = min(count / target, 1.0)
        elif t.get("status") == "partial":
            frac = 0.4
        else:
            frac = 0.0
        earned += w * frac
    return earned / total_weight if total_weight else 0.5


def _checks_pass_rate(checks: list[dict[str, Any]]) -> float:
    if not checks:
        return 0.0
    passed = sum(1 for c in checks if c.get("pass"))
    return passed / len(checks)


def _word_count_band_score(word_count: int) -> float:
    if _WORD_COUNT_MIN <= word_count <= _WORD_COUNT_MAX:
        return 1.0
    if word_count < _WORD_COUNT_MIN:
        return max(0.0, word_count / _WORD_COUNT_MIN)
    excess = word_count - _WORD_COUNT_MAX
    return max(0.0, 1.0 - excess / _WORD_COUNT_MAX)


def score_content_draft(
    property_id: int | None,
    keyword: str,
    body_html: str,
    title_tag: str = "",
    meta_description: str = "",
    landing_url: str | None = None,
    *,
    keyword_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Score draft content. Pass keyword_rows in tests; otherwise loads from DB.
    """
    body_text = _html_to_text(body_html)
    tokens = tokenize_words(body_text)
    word_count = count_words(tokens)
    reading_level = flesch_kincaid_grade(tokens, body_text) if tokens else 0.0

    corpus_tokens = _match_tokens(f"{title_tag} {body_text}")
    corpus_set = set(corpus_tokens)

    rows = keyword_rows
    if rows is None and property_id is not None:
        with db_session() as conn:
            data = read_latest_keyword_data(conn, property_id)
            rows = (data or {}).get("rows") or []
            if not isinstance(rows, list):
                rows = []
    rows = rows or []

    raw_terms = _collect_gsc_terms(keyword, landing_url, rows)
    terms: list[dict[str, Any]] = []
    for t in raw_terms:
        term_str = str(t["term"])
        status, count = _term_match(term_str, corpus_tokens, corpus_set)
        target = _term_target(term_str, str(t.get("importance") or "medium"))
        terms.append({**t, "status": status, "count": count, "target": target})

    checks = [
        _keyword_in_title_check(keyword, title_tag),
        _keyword_in_h1_check(keyword, body_html),
        _keyword_in_intro_check(keyword, body_text),
        _title_check(title_tag),
        _meta_check(meta_description),
        _h1_check(body_html),
        _word_count_check(word_count),
        _reading_level_check(reading_level, word_count),
    ]

    term_cov = _term_coverage_score(terms)
    check_rate = _checks_pass_rate(checks)
    wc_band = _word_count_band_score(word_count)

    raw_grade = term_cov * 0.5 + check_rate * 0.35 + wc_band * 0.15
    grade_score = max(0, min(100, round(raw_grade * 100)))

    return {
        "grade_score": grade_score,
        "grade_label": _grade_label(grade_score),
        "word_count": word_count,
        "word_count_target": _WORD_COUNT_TARGET,
        "word_count_min": _WORD_COUNT_MIN,
        "word_count_max": _WORD_COUNT_MAX,
        "reading_level": round(reading_level, 1),
        "reading_level_target": _READING_GRADE_TARGET,
        "terms": terms,
        "checks": checks,
        "provenance": PROVENANCE,
    }
