"""Data types and shared detection helpers for AI citation checks."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CitationResult:
    """Structured result from a live citation check."""

    query: str
    brand: str
    domain: str
    provider: str
    brand_mentioned: bool
    domain_cited: bool
    sources: list[str] = field(default_factory=list)
    competitors_cited: list[str] = field(default_factory=list)
    answer_excerpt: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "brand": self.brand,
            "domain": self.domain,
            "provider": self.provider,
            "brand_mentioned": self.brand_mentioned,
            "domain_cited": self.domain_cited,
            "sources": self.sources,
            "competitors_cited": self.competitors_cited,
            "answer_excerpt": self.answer_excerpt[:400],
        }


def _domain_in_sources(domain: str, sources: list[str]) -> bool:
    needle = domain.lower().lstrip("www.").split("/")[0]
    return any(needle in s.lower() for s in sources)


def _detect_competitors(sources: list[str], domain: str) -> list[str]:
    own = domain.lower().lstrip("www.").split("/")[0]
    seen: set[str] = set()
    competitors: list[str] = []
    for s in sources:
        m = re.search(r"https?://(?:www\.)?([^/\s]+)", s, re.I)
        if m:
            d = m.group(1).lower()
            if d != own and d not in seen:
                seen.add(d)
                competitors.append(d)
    return competitors[:10]


def _parametric_prompt(query: str, brand: str, domain: str) -> str:
    return (
        f"{query}\n\n"
        f"After answering, state whether you know the brand '{brand}' "
        f"and whether you would cite '{domain}' as a source."
    )


def _parametric_brand_check(brand: str, domain: str, answer: str) -> tuple[bool, bool]:
    brand_mentioned = brand.lower() in answer.lower()
    domain_cited = domain.lower().lstrip("www.").split("/")[0] in answer.lower()
    return brand_mentioned, domain_cited
