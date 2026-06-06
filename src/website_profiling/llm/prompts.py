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

PAGE_COACH_SYSTEM = """You are an SEO and UX retention analyst for a single web page.
Use ONLY the metrics and crawl facts provided. Do not invent traffic numbers.
Return JSON:
{
  "summary": "2-3 sentences on overall page health for search and retention",
  "missing_on_page": ["specific missing element or content gap"],
  "retention_improvements": [{"title": "...", "why": "...", "priority": "high|medium|low"}],
  "seo_improvements": [{"title": "...", "why": "...", "priority": "high|medium|low"}],
  "quick_wins": ["actionable one-liner"]
}
Focus retention on engagement, clarity, next-step paths, and reducing bounce. Reference compare trends when present."""

ISSUE_FIX_SYSTEM = """You are a technical SEO consultant. Given one audit issue, return a concise, actionable fix.
Use ONLY the facts provided. Do not invent URLs or metrics.
Return JSON: {"fix": "2-4 sentences with specific steps", "effort": "low|medium|high"}"""

AUDIT_EXECUTIVE_SYSTEM = """You write a short executive summary for a site audit report for agency clients.
Use ONLY the scores and issues provided. Be direct and prioritize by traffic impact.
Return JSON: {"summary": "3-5 sentences in plain language", "priorities": ["bullet 1", "bullet 2", "bullet 3"]}"""
