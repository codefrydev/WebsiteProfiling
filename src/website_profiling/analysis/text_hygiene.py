"""Filter structural HTML tokens from semantic text pipelines (keywords, fingerprints, LLM)."""
from __future__ import annotations

import re

# heading_sequence stores tag names (h1,h2,...) — not heading copy.
HTML_HEADING_TOKENS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
STRUCTURAL_JUNK_TOKENS = HTML_HEADING_TOKENS | frozenset(
    {
        "html",
        "body",
        "head",
        "div",
        "span",
        "class",
        "href",
        "http",
        "https",
        "www",
        "com",
        "org",
        "net",
        "null",
        "undefined",
        "nan",
    }
)


def tokenize_term(term: str) -> list[str]:
    return [t for t in re.findall(r"\b[\w']+\b", (term or "").lower()) if t]


def is_junk_semantic_term(term: str) -> bool:
    """True when a term/n-gram is structural noise, not site vocabulary."""
    tokens = tokenize_term(term)
    if not tokens:
        return True
    if all(t in HTML_HEADING_TOKENS for t in tokens):
        return True
    if all(t in STRUCTURAL_JUNK_TOKENS for t in tokens):
        return True
    return False


def filter_semantic_terms(terms: list[str]) -> list[str]:
    return [t for t in terms if t and not is_junk_semantic_term(t)]


def filter_topic_clusters(clusters: list[dict]) -> list[dict]:
    """Drop token clusters whose representative is structural HTML noise."""
    out: list[dict] = []
    for cl in clusters:
        top = str(cl.get("top_keyword") or cl.get("representative") or "").strip()
        if not top or is_junk_semantic_term(top):
            continue
        keywords = cl.get("keywords")
        if isinstance(keywords, list):
            cleaned = filter_semantic_terms([str(k) for k in keywords])
            cl = {**cl, "keywords": cleaned}
        out.append(cl)
    return out
