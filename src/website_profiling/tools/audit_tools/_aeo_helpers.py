"""Shared helpers for AEO/agent-readiness checks.

Used by agent_readiness.py (and potentially other GEO modules) to avoid
duplicating logic across checkers.
"""
from __future__ import annotations

import re
from typing import Any


# ---------------------------------------------------------------------------
# URL classification
# ---------------------------------------------------------------------------

_DOC_PATH_PATTERNS = re.compile(
    r"(?:/docs?/|/guide(?:s|lines?)?/|/api(?:-docs?)?/|/reference/|/manual/"
    r"|/tutorial(?:s)?/|/how-?to(?:s)?/|/help/|/wiki/|/kb/|/support/"
    r"|/learn/|/getting-started|\.md$)",
    re.I,
)


def is_doc_like_url(url: str) -> bool:
    """Return True if the URL looks like documentation/guide content."""
    return bool(_DOC_PATH_PATTERNS.search(url))


# ---------------------------------------------------------------------------
# HTML → plain text
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE = re.compile(r"\s+")


def strip_html_to_text(html: str) -> str:
    """Remove HTML tags and normalise whitespace."""
    text = _TAG_RE.sub(" ", html or "")
    return _MULTI_SPACE.sub(" ", text).strip()


# ---------------------------------------------------------------------------
# Token counting (approximate, cl100k_base / GPT-4 tokenizer)
# ---------------------------------------------------------------------------

_ENC = None  # lazy-loaded singleton


def _get_encoder():
    global _ENC
    if _ENC is None:
        import tiktoken
        _ENC = tiktoken.get_encoding("cl100k_base")
    return _ENC


def count_tokens(text: str) -> int:
    """Return approximate GPT-4 (cl100k_base) token count for text."""
    if not text:
        return 0
    try:
        return len(_get_encoder().encode(text))
    except Exception:
        # Rough fallback: ~4 chars per token
        return max(0, len(text) // 4)


# ---------------------------------------------------------------------------
# AGENTS.md / project context scoring
# ---------------------------------------------------------------------------

_PURPOSE_RE = re.compile(
    r"(?:what it is|overview|purpose|about|description|this (?:is|repo|project))",
    re.I,
)
_STACK_RE = re.compile(
    r"(?:stack|tech(?:nology)?|language|framework|built with|requires?|dependency|dependencies)",
    re.I,
)
_PATHS_RE = re.compile(
    r"(?:key paths?|directory|structure|src/|lib/|where to (?:edit|find)|file layout)",
    re.I,
)
_EDIT_RE = re.compile(
    r"(?:where to edit|edit target|how to|command|run|scripts?|makefile|task)",
    re.I,
)


def score_agents_md_content(text: str) -> dict[str, Any]:
    """Score AGENTS.md/CLAUDE.md content quality (max 3 signal points)."""
    has_purpose = bool(_PURPOSE_RE.search(text))
    has_stack = bool(_STACK_RE.search(text))
    has_paths = bool(_PATHS_RE.search(text))
    has_edit = bool(_EDIT_RE.search(text))
    lines = text.count("\n")
    word_count = len(text.split())
    points = 0
    if has_purpose:
        points += 1
    if has_stack or has_paths:
        points += 1
    if has_edit:
        points += 1
    return {
        "has_purpose_description": has_purpose,
        "has_stack_or_paths": has_stack or has_paths,
        "has_edit_targets": has_edit,
        "line_count": lines,
        "word_count": word_count,
        "content_score": points,
    }


# ---------------------------------------------------------------------------
# Copy-for-AI detection
# ---------------------------------------------------------------------------

_COPY_FOR_AI_TEXT_RE = re.compile(
    r"copy\s+(?:for\s+)?(?:ai|llm|claude|gpt|assistant)|copy\s+(?:as\s+)?markdown"
    r"|view\s+(?:raw|source|markdown)|copy\s+page\s+content|raw\s+view"
    r"|copy\s+to\s+(?:clipboard|llm)",
    re.I,
)
_COPY_DATA_ATTR_RE = re.compile(
    r'data-(?:copy|clipboard|ai-copy|md-copy)[=\s]', re.I
)
_COPY_ARIA_RE = re.compile(
    r'aria-label=["\'][^"\']*(?:copy|clipboard|markdown)[^"\']*["\']', re.I
)


def detect_copy_for_ai(html: str) -> bool:
    """Return True if page HTML contains copy-for-AI or raw-view affordances."""
    if not html:
        return False
    if _COPY_FOR_AI_TEXT_RE.search(html):
        return True
    if _COPY_DATA_ATTR_RE.search(html):
        return True
    if _COPY_ARIA_RE.search(html):
        return True
    return False


# ---------------------------------------------------------------------------
# Semantic landmark detection
# ---------------------------------------------------------------------------

_SEMANTIC_RE = re.compile(r"<(main|article|nav|header|footer|aside|section)[^>]*>", re.I)
_CODE_BLOCK_RE = re.compile(r"<pre[^>]*>|```", re.I)
_TABLE_RE = re.compile(r"<table[^>]*>", re.I)
_H1_RE = re.compile(r"<h1[^>]*>", re.I)
_H2_RE = re.compile(r"<h2[^>]*>", re.I)
_H3_RE = re.compile(r"<h3[^>]*>", re.I)


def score_content_structure_aeo(html: str, excerpt: str, heading_sequence: str) -> dict[str, Any]:
    """Score content structure signals for AEO (max 25 pts)."""
    seq = (heading_sequence or "").lower()
    has_h1 = "h1" in seq or bool(_H1_RE.search(html))
    has_h2 = "h2" in seq or bool(_H2_RE.search(html))
    has_h3 = "h3" in seq or bool(_H3_RE.search(html))
    h2_count = len(_H2_RE.findall(html))
    h3_count = len(_H3_RE.findall(html))

    semantic_tags = _SEMANTIC_RE.findall(html)
    unique_semantic = len({t.lower() for t in semantic_tags})
    has_main = any(t.lower() == "main" for t in semantic_tags)
    has_article = any(t.lower() == "article" for t in semantic_tags)

    code_blocks = len(_CODE_BLOCK_RE.findall(html))
    table_count = len(_TABLE_RE.findall(html))

    points = 0
    # Heading hierarchy (up to 8)
    if has_h1:
        points += 3
    if has_h2:
        points += 3
        if has_h3:
            points += 2
    # Semantic landmarks (up to 6)
    if has_main:
        points += 3
    if has_article:
        points += 3
    # Code + tables (up to 6)
    if code_blocks >= 1:
        points += 3
    if table_count >= 1:
        points += 3
    # Section density bonus (up to 5)
    if h2_count >= 3:
        points += 3
    elif h2_count >= 1:
        points += 1
    if h3_count >= 2:
        points += 2
    elif h3_count >= 1:
        points += 1

    return {
        "has_h1": has_h1,
        "has_h2": has_h2,
        "has_h3": has_h3,
        "h2_count": h2_count,
        "h3_count": h3_count,
        "unique_semantic_landmarks": unique_semantic,
        "has_main": has_main,
        "has_article": has_article,
        "code_blocks": code_blocks,
        "tables": table_count,
        "structure_score": min(25, points),
    }
