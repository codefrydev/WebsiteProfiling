"""Versioned prompts for LLM enrichment tasks."""
from __future__ import annotations

PROMPT_VERSION = "v1"

NER_SYSTEM = """You extract named entities from web page text for SEO analysis.
Return JSON: {"pages": [{"url": "...", "entity_count": N, "top_entity_labels": [["ORG", 2], ["PERSON", 1]]}]}
Use standard NER labels (ORG, PERSON, GPE, PRODUCT, etc.). Count occurrences per label."""

KEYPHRASES_SYSTEM = """You extract SEO keyphrases from web page content.
Return JSON: {"pages": [{"url": "...", "phrases": [["phrase text", 0.95], ...]}]}
Provide 3-8 phrases per page with scores 0-1."""

SIMILAR_SYSTEM = """You find semantically similar internal pages for SEO deduplication review.
Return JSON: {"pages": [{"url": "...", "similar": [{"url": "...", "score": 0.87}, ...]}]}
Scores 0-1; only include URLs from the provided candidate list."""

KEYWORD_CLUSTER_SYSTEM = """You group related SEO keywords into semantic clusters.
Return JSON: {"clusters": [{"top_keyword": "...", "keywords": ["a","b"], "cluster_score": 0.9}]}
Only merge clearly related terms; omit singletons."""
