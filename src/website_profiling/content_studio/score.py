"""Content Studio scoring from GSC keywords and on-page heuristics."""
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
_WORD_COUNT_MAX = 2500


def _grade_label(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _normalize_url(url: str) -> str:
    return (url or "").strip().lower().rstrip("/")


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


def _term_in_corpus(term: str, corpus: str) -> str:
    """Return included | partial | missing for a term against corpus text."""
    t = (term or "").strip().lower()
    if not t:
        return "missing"
    c = (corpus or "").lower()
    if t in c:
        return "included"
    words = [w for w in re.split(r"\W+", t) if len(w) >= 3]
    if words and all(w in c for w in words):
        return "partial"
    return "missing"


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
    if not terms:
        return 0.5
    total_weight = 0.0
    earned = 0.0
    for t in terms:
        w = 2.0 if t.get("importance") == "high" else 1.0
        total_weight += w
        status = t.get("status") or "missing"
        if status == "included":
            earned += w
        elif status == "partial":
            earned += w * 0.5
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

    corpus = f"{title_tag} {body_text}".lower()

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
        status = _term_in_corpus(str(t["term"]), corpus)
        terms.append({**t, "status": status})

    checks = [
        _title_check(title_tag),
        _meta_check(meta_description),
        _h1_check(body_html),
        _word_count_check(word_count),
    ]

    term_cov = _term_coverage_score(terms)
    check_rate = _checks_pass_rate(checks)
    wc_band = _word_count_band_score(word_count)

    raw_grade = term_cov * 0.6 + check_rate * 0.25 + wc_band * 0.15
    grade_score = max(0, min(100, round(raw_grade * 100)))

    return {
        "grade_score": grade_score,
        "grade_label": _grade_label(grade_score),
        "word_count": word_count,
        "reading_level": round(reading_level, 1),
        "terms": terms,
        "checks": checks,
        "provenance": PROVENANCE,
    }
