"""Shared constants for content analysis."""
from __future__ import annotations

STOP_WORDS = frozenset({
    "the", "and", "for", "that", "this", "with", "from", "your", "have", "are",
    "was", "were", "been", "will", "would", "could", "should", "about", "which",
    "their", "there", "what", "when", "where", "more", "some", "than", "them",
    "other", "into", "over", "also", "just", "after", "before", "only", "then",
    "very", "most", "each", "such", "like", "does", "here", "because", "being",
    "well", "while", "these", "those", "both", "many", "much", "even", "back",
    "through", "still", "between", "every", "under", "last", "long", "great",
    "make", "same", "come", "take", "know", "they", "page", "site", "home",
    "click", "read", "view", "next", "menu", "main", "skip", "content", "link",
    "http", "https", "www", "html", "class", "none", "true", "false", "null",
})

CHROME_TAGS = ("nav", "footer", "header", "aside")
