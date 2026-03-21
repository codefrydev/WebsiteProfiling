"""
Keywords Explorer: keyword research, clustering, and intent classification.

Usage:
    python -m src keywords research --seed "seo tools" --location "United States"
    python -m src keywords cluster  --file keywords.txt
    python -m src keywords export   --output keywords.csv

Uses DataForSEO if DATAFORSEO_LOGIN/PASSWORD set, otherwise Google Suggest (free).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from collections import defaultdict
from typing import Any, Optional
from urllib.parse import quote_plus

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import get_connection, init_extended_schema

_DFS_LOGIN = os.getenv("DATAFORSEO_LOGIN", "")
_DFS_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "")
_OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

_INTENT_PATTERNS = {
    "transactional": [r"\bbuy\b", r"\bprice\b", r"\bcheap\b", r"\bdiscount\b",
                      r"\bpurchase\b", r"\bshop\b", r"\border\b", r"\bcost\b"],
    "navigational": [r"\blogin\b", r"\bsign in\b", r"\bwebsite\b", r"\bofficial\b",
                     r"\bhomepage\b"],
    "commercial": [r"\bbest\b", r"\btop\b", r"\breview\b", r"\bvs\b", r"\bcompare\b",
                   r"\balternative\b", r"\brating\b"],
    "informational": [r"\bhow\b", r"\bwhat\b", r"\bwhy\b", r"\bwhen\b", r"\bwhere\b",
                      r"\bguide\b", r"\btutorial\b", r"\btips\b"],
}


class KeywordsExplorer:
    """Keyword research and analysis tools."""

    def __init__(self, timeout: int = 15, delay: float = 0.5) -> None:
        self.timeout = timeout
        self.delay = delay
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; KeywordsExplorer/1.0)"})

    def research_keywords(self, seed: str, location: str = "United States") -> list[dict]:
        """Research keywords starting from a seed term. Returns list of keyword dicts."""
        if _DFS_LOGIN and _DFS_PASSWORD:
            return self._dfs_keyword_ideas(seed, location)
        suggestions = self.get_keyword_suggestions(seed)
        questions = self.get_question_keywords(seed)
        related = self.get_related_keywords(seed)
        seen: set[str] = set()
        results = []
        for kw_dict in suggestions + questions + related:
            kw = kw_dict.get("keyword", "")
            if kw and kw not in seen:
                seen.add(kw)
                kw_dict["search_intent"] = self.classify_intent(kw)
                results.append(kw_dict)
        return results

    def _dfs_keyword_ideas(self, seed: str, location: str) -> list[dict]:
        """Fetch keyword ideas via DataForSEO."""
        payload = [{"keyword": seed, "location_name": location, "language_code": "en", "limit": 100}]
        try:
            r = self._session.post(
                "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live",
                auth=(_DFS_LOGIN, _DFS_PASSWORD),
                json=payload,
                timeout=self.timeout,
            )
            r.raise_for_status()
            data = r.json()
            items = (data.get("tasks", [{}])[0].get("result", [{}]) or [{}])[0].get("items", [])
            return [
                {
                    "keyword": i.get("keyword", ""),
                    "volume": (i.get("keyword_info") or {}).get("search_volume", 0),
                    "cpc": (i.get("keyword_info") or {}).get("cpc", 0),
                    "difficulty": (i.get("keyword_properties") or {}).get("keyword_difficulty", 0),
                    "search_intent": (i.get("keyword_properties") or {}).get("intent", {}).get(
                        "main_intent", "informational"
                    ),
                    "clicks_per_search": (i.get("keyword_info") or {}).get("search_volume", 0),
                }
                for i in items
            ]
        except Exception as exc:
            print(f"DataForSEO error: {exc}")
            return self.get_keyword_suggestions(seed)

    def get_keyword_suggestions(self, seed: str) -> list[dict]:
        """Get keyword suggestions using Google Autocomplete API (free)."""
        suggestions = []
        suffixes = ["", " a", " b", " c", " d", " how", " why", " what", " best", " top"]
        for suffix in suffixes[:5]:
            try:
                time.sleep(self.delay)
                url = f"https://suggestqueries.google.com/complete/search?q={quote_plus(seed + suffix)}&client=firefox"
                r = self._session.get(url, timeout=self.timeout)
                r.raise_for_status()
                data = r.json()
                for kw in data[1] if len(data) > 1 else []:
                    if isinstance(kw, str) and kw.strip():
                        suggestions.append({"keyword": kw.strip(), "volume": 0, "source": "autocomplete"})
            except Exception:
                pass
        seen: set[str] = set()
        unique = []
        for s in suggestions:
            if s["keyword"] not in seen:
                seen.add(s["keyword"])
                unique.append(s)
        return unique

    def get_question_keywords(self, topic: str) -> list[dict]:
        """Get question-format keyword suggestions (who/what/when/where/why/how)."""
        prefixes = ["how to", "what is", "why does", "when to", "where to", "how does",
                    "what are", "how can", "best way to"]
        results = []
        for prefix in prefixes[:5]:
            try:
                time.sleep(self.delay)
                query = f"{prefix} {topic}"
                url = f"https://suggestqueries.google.com/complete/search?q={quote_plus(query)}&client=firefox"
                r = self._session.get(url, timeout=self.timeout)
                r.raise_for_status()
                data = r.json()
                for kw in data[1] if len(data) > 1 else []:
                    if isinstance(kw, str) and kw.strip():
                        results.append({"keyword": kw.strip(), "volume": 0, "search_intent": "informational"})
            except Exception:
                pass
        return results

    def get_related_keywords(self, keyword: str) -> list[dict]:
        """Get related keywords using Google Suggest with alphabet expansion."""
        results = []
        for char in "abcde":
            try:
                time.sleep(self.delay * 0.5)
                query = f"{keyword} {char}"
                url = f"https://suggestqueries.google.com/complete/search?q={quote_plus(query)}&client=firefox"
                r = self._session.get(url, timeout=self.timeout)
                r.raise_for_status()
                data = r.json()
                for kw in data[1] if len(data) > 1 else []:
                    if isinstance(kw, str) and kw.strip():
                        results.append({"keyword": kw.strip(), "volume": 0})
            except Exception:
                pass
        return results

    def cluster_keywords(self, keywords: list[str]) -> list[dict]:
        """Cluster keywords by semantic similarity using word overlap.

        Returns list of cluster dicts with name, keywords, parent_keyword.
        """
        if not keywords:
            return []

        # Simple token-overlap clustering
        clusters: dict[str, list[str]] = defaultdict(list)
        assigned: set[str] = set()

        # Sort by length to pick shorter phrases as cluster heads
        sorted_kws = sorted(keywords, key=lambda k: len(k.split()))

        for kw in sorted_kws:
            if kw in assigned:
                continue
            tokens = set(kw.lower().split())
            best_cluster: Optional[str] = None
            best_overlap = 0
            for head in clusters:
                head_tokens = set(head.lower().split())
                overlap = len(tokens & head_tokens) / max(len(tokens | head_tokens), 1)
                if overlap > 0.4 and overlap > best_overlap:
                    best_overlap = overlap
                    best_cluster = head
            if best_cluster:
                clusters[best_cluster].append(kw)
            else:
                clusters[kw] = [kw]
            assigned.add(kw)

        return [
            {
                "name": head,
                "parent_keyword": head,
                "keywords": kws,
                "volume_total": 0,
                "size": len(kws),
            }
            for head, kws in clusters.items()
        ]

    def classify_intent(self, keyword: str) -> str:
        """Classify the search intent of a keyword (informational/navigational/transactional/commercial)."""
        kw_lower = keyword.lower()
        for intent, patterns in _INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, kw_lower):
                    return intent
        return "informational"

    def calculate_difficulty(self, keyword: str, top_results: list[dict]) -> int:
        """Estimate keyword difficulty (0-100) based on top SERP results.

        Simple heuristic: assumes higher DR sites = harder keyword.
        """
        if not top_results:
            return 30
        avg_dr = sum(r.get("domain_rating", 30) for r in top_results[:10]) / min(len(top_results), 10)
        return min(int(avg_dr), 100)

    def get_serp_features(self, keyword: str) -> list[str]:
        """Identify likely SERP features for a keyword based on its content."""
        features = []
        kw_lower = keyword.lower()
        if any(w in kw_lower for w in ["how", "what", "why", "when"]):
            features.append("featured_snippet")
        if any(w in kw_lower for w in ["best", "top", "review"]):
            features.append("reviews")
        if any(w in kw_lower for w in ["near me", "local", "city", "address"]):
            features.append("local_pack")
        if any(w in kw_lower for w in ["news", "latest", "today", "2024", "2025"]):
            features.append("top_stories")
        if any(w in kw_lower for w in ["image", "photo", "picture"]):
            features.append("image_pack")
        return features

    def get_ai_suggestions(self, topic: str, api_key: Optional[str] = None) -> list[str]:
        """Use OpenAI to generate keyword ideas for a topic."""
        key = api_key or _OPENAI_KEY
        if not key:
            print("No OpenAI key. Falling back to Google Suggest.")
            return [k["keyword"] for k in self.get_keyword_suggestions(topic)]
        try:
            import openai
            client = openai.OpenAI(api_key=key)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Generate 20 SEO keyword ideas for the topic: '{topic}'. "
                        "Include a mix of informational, commercial, and transactional keywords. "
                        "Return only the keywords, one per line."
                    ),
                }],
                max_tokens=400,
            )
            text = resp.choices[0].message.content or ""
            return [line.strip().strip("-•*").strip() for line in text.splitlines() if line.strip()]
        except Exception as exc:
            print(f"OpenAI error: {exc}")
            return []

    def translate_keyword(self, keyword: str, languages: list[str]) -> dict:
        """Translate a keyword to multiple languages using Google Translate (unofficial)."""
        results: dict[str, str] = {}
        for lang in languages:
            try:
                time.sleep(0.3)
                url = (
                    f"https://translate.googleapis.com/translate_a/single"
                    f"?client=gtx&sl=en&tl={lang}&dt=t&q={quote_plus(keyword)}"
                )
                r = self._session.get(url, timeout=self.timeout)
                r.raise_for_status()
                data = r.json()
                translated = data[0][0][0] if data and data[0] and data[0][0] else keyword
                results[lang] = translated
            except Exception:
                results[lang] = keyword
        return results


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def cmd_research(db_path: str, seed: str, location: str = "United States") -> None:
    """Research keywords from seed and store in DB."""
    print(f"Researching keywords for: '{seed}'...", flush=True)
    explorer = KeywordsExplorer()
    keywords = explorer.research_keywords(seed, location)
    print(f"Found {len(keywords)} keywords.")

    conn = get_connection(db_path)
    init_extended_schema(conn)
    for kw in keywords:
        try:
            conn.execute(
                """INSERT OR REPLACE INTO keywords_db
                   (keyword, volume, difficulty, cpc, search_intent, updated_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                (
                    kw.get("keyword", ""),
                    kw.get("volume", 0),
                    kw.get("difficulty", 0),
                    kw.get("cpc", 0),
                    kw.get("search_intent", "informational"),
                ),
            )
        except Exception:
            pass
    conn.commit()
    conn.close()

    for kw in keywords[:20]:
        print(f"  {kw['keyword']:<50} intent={kw.get('search_intent', '?')}")
    if len(keywords) > 20:
        print(f"  ... and {len(keywords) - 20} more (stored in DB)")


def cmd_cluster(db_path: str, keywords_file: str) -> None:
    """Cluster keywords from a file and print/store results."""
    try:
        with open(keywords_file) as f:
            keywords = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"File not found: {keywords_file}")
        return

    print(f"Clustering {len(keywords)} keywords...")
    explorer = KeywordsExplorer()
    clusters = explorer.cluster_keywords(keywords)

    conn = get_connection(db_path)
    init_extended_schema(conn)
    for cluster in clusters:
        conn.execute(
            """INSERT INTO keyword_clusters (name, parent_keyword, keywords, volume_total)
               VALUES (?, ?, ?, ?)""",
            (
                cluster["name"],
                cluster["parent_keyword"],
                json.dumps(cluster["keywords"]),
                cluster.get("volume_total", 0),
            ),
        )
    conn.commit()
    conn.close()

    print(f"\n{len(clusters)} clusters:")
    for c in sorted(clusters, key=lambda x: -x["size"])[:20]:
        print(f"  [{c['size']:>3}] {c['name']}")


def cmd_export(db_path: str, output_file: str) -> None:
    """Export keywords from DB to CSV."""
    conn = get_connection(db_path)
    init_extended_schema(conn)
    try:
        cur = conn.execute("SELECT * FROM keywords_db ORDER BY volume DESC")
        rows = [dict(r) for r in cur.fetchall()]
    except Exception:
        rows = []
    conn.close()

    if not rows:
        print("No keywords in DB.")
        return

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"Exported {len(rows)} keywords to {output_file}")


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for keywords command."""
    parser = argparse.ArgumentParser(description="Keywords Explorer")
    parser.add_argument("subcommand", choices=["research", "cluster", "export"])
    parser.add_argument("--db", default="report.db")
    parser.add_argument("--seed", help="Seed keyword for research")
    parser.add_argument("--location", default="United States")
    parser.add_argument("--file", dest="keywords_file", help="File with keywords for clustering")
    parser.add_argument("--output", default="keywords_export.csv")
    parsed = parser.parse_args(args)

    if parsed.subcommand == "research":
        if not parsed.seed:
            print("Provide --seed keyword")
            return 1
        cmd_research(parsed.db, parsed.seed, parsed.location)
    elif parsed.subcommand == "cluster":
        if not parsed.keywords_file:
            print("Provide --file path")
            return 1
        cmd_cluster(parsed.db, parsed.keywords_file)
    elif parsed.subcommand == "export":
        cmd_export(parsed.db, parsed.output)
    return 0
