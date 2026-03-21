"""
Content Marketing Tools: content grading, briefs, AI writing, and inventory management.

Usage:
    python -m src content explorer  --query "seo tools"
    python -m src content grade     --url https://example.com/page --keyword "seo"
    python -m src content brief     --keyword "best seo tools" --intent commercial
    python -m src content inventory --project 1
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import Counter
from typing import Any, Optional
from urllib.parse import urlparse

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import get_connection, init_extended_schema

_OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "shall", "can", "this", "that", "these", "those", "it", "its",
}


class ContentExplorer:
    """Discover and analyze content across the web."""

    def __init__(self, timeout: int = 15) -> None:
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; ContentExplorer/1.0)"})

    def search_content(self, query: str, filters: Optional[dict] = None) -> list[dict]:
        """Search for content using Google Custom Search or direct scraping."""
        filters = filters or {}
        results = []
        try:
            url = f"https://suggestqueries.google.com/complete/search?q={requests.utils.quote(query)}&client=firefox"
            r = self._session.get(url, timeout=self.timeout)
            r.raise_for_status()
        except Exception:
            pass
        # Return placeholder structure for content search
        return results

    def index_url(self, url: str) -> dict:
        """Fetch and analyze a URL: extract title, word count, entities, etc."""
        try:
            r = self._session.get(url, timeout=self.timeout)
            r.raise_for_status()
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(r.text, "html.parser")
            title = soup.find("title")
            text = soup.get_text(separator=" ", strip=True)
            words = text.split()
            h1s = [h.get_text(strip=True) for h in soup.find_all("h1")]
            h2s = [h.get_text(strip=True) for h in soup.find_all("h2")]
            domain = urlparse(url).netloc
            return {
                "url": url,
                "domain": domain,
                "title": title.get_text(strip=True) if title else "",
                "word_count": len(words),
                "h1": h1s[:3],
                "h2": h2s[:10],
                "text_preview": " ".join(words[:200]),
                "language": "en",
            }
        except Exception as exc:
            return {"url": url, "error": str(exc)}

    def find_trending_topics(self, niche: str) -> list[dict]:
        """Find trending content topics for a niche using Google Trends RSS."""
        topics = []
        try:
            import feedparser
            feed_url = f"https://trends.google.com/trends/trendingsearches/daily/rss?geo=US"
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:20]:
                title = entry.get("title", "")
                if niche.lower() in title.lower() or not niche:
                    topics.append({"title": title, "traffic": entry.get("ht_approx_traffic", "")})
        except Exception:
            pass
        if not topics:
            # Fallback: return Google Autocomplete for the niche
            try:
                url = f"https://suggestqueries.google.com/complete/search?q={requests.utils.quote(niche + ' trending')}&client=firefox"
                r = self._session.get(url, timeout=10)
                data = r.json()
                topics = [{"title": s, "traffic": ""} for s in data[1][:10]] if len(data) > 1 else []
            except Exception:
                pass
        return topics

    def find_link_prospects(self, topic: str, min_dr: int = 30) -> list[dict]:
        """Find websites that might link to content on a topic (link building prospects)."""
        try:
            url = f"https://suggestqueries.google.com/complete/search?q={requests.utils.quote(topic + ' resources')}&client=firefox"
            r = self._session.get(url, timeout=self.timeout)
            data = r.json()
            suggestions = data[1] if len(data) > 1 else []
            return [{"query": s, "potential_dr": min_dr} for s in suggestions[:10]]
        except Exception:
            return []


class ContentGrader:
    """Grade content quality against SEO best practices and competitor benchmarks."""

    def grade_content(
        self,
        url_or_text: str,
        keyword: str,
        competitors: Optional[list[dict]] = None,
    ) -> dict:
        """Grade content and return score with recommendations."""
        if url_or_text.startswith("http"):
            explorer = ContentExplorer()
            page_data = explorer.index_url(url_or_text)
            text = page_data.get("text_preview", "")
        else:
            text = url_or_text
            page_data = {"word_count": len(text.split())}

        readability = self.check_readability(text)
        entities = self.extract_entities(text)
        competitor_data = competitors or []
        score_data = self.calculate_score(
            {**page_data, "text": text, "keyword": keyword, "readability": readability},
            competitor_data,
        )
        recommendations = self.get_recommendations(score_data)

        return {
            "url": url_or_text if url_or_text.startswith("http") else None,
            "keyword": keyword,
            "score": score_data.get("total", 0),
            "details": score_data,
            "recommendations": recommendations,
            "readability": readability,
            "entities": entities[:20],
        }

    def extract_entities(self, text: str) -> list[str]:
        """Extract key named entities and noun phrases from text (simple heuristic)."""
        # Capitalize words that appear multiple times = likely entities
        words = re.findall(r"\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b", text)
        counts = Counter(words)
        return [word for word, count in counts.most_common(30) if count >= 2 and word.lower() not in _STOPWORDS]

    def calculate_score(self, content_data: dict, competitor_data: list) -> dict:
        """Calculate multi-dimensional content score (0-100)."""
        scores: dict[str, int] = {}
        text = content_data.get("text", "").lower()
        keyword = content_data.get("keyword", "").lower()
        word_count = content_data.get("word_count", len(text.split()))

        # Keyword usage (0-20)
        kw_count = text.count(keyword) if keyword else 0
        kw_density = kw_count / max(word_count, 1) * 100
        scores["keyword_usage"] = 20 if 0.5 <= kw_density <= 3 else (10 if kw_count > 0 else 0)

        # Word count (0-20)
        avg_competitor_wc = sum(c.get("word_count", 0) for c in competitor_data) / max(len(competitor_data), 1) if competitor_data else 1200
        if word_count >= avg_competitor_wc * 0.9:
            scores["word_count"] = 20
        elif word_count >= avg_competitor_wc * 0.6:
            scores["word_count"] = 12
        elif word_count >= 600:
            scores["word_count"] = 8
        else:
            scores["word_count"] = 3

        # Readability (0-20)
        readability = content_data.get("readability", {})
        flesch = readability.get("flesch_score", 50)
        scores["readability"] = int(min(20, (flesch / 100) * 20))

        # Headings structure (0-20)
        h2_count = len(content_data.get("h2", []))
        scores["structure"] = min(20, h2_count * 5)

        # Entities/LSI (0-20)
        entity_count = len(content_data.get("entities", []))
        scores["entities"] = min(20, entity_count * 2)

        total = sum(scores.values())
        return {"total": total, "breakdown": scores, "max": 100}

    def get_recommendations(self, score_data: dict) -> list[str]:
        """Generate actionable recommendations based on score breakdown."""
        recs = []
        breakdown = score_data.get("breakdown", {})

        if breakdown.get("keyword_usage", 20) < 15:
            recs.append("Include target keyword more naturally throughout the content (aim for 1-2% density).")
        if breakdown.get("word_count", 20) < 15:
            recs.append("Expand content length to match or exceed competitor average word counts.")
        if breakdown.get("readability", 20) < 12:
            recs.append("Improve readability: use shorter sentences, simpler words, and more paragraph breaks.")
        if breakdown.get("structure", 20) < 10:
            recs.append("Add more H2/H3 headings to improve content structure and scannability.")
        if breakdown.get("entities", 20) < 10:
            recs.append("Include more topically relevant entities and LSI keywords to improve semantic coverage.")

        total = score_data.get("total", 0)
        if total >= 80:
            recs.insert(0, "Content is well-optimized. Consider adding multimedia or updating statistics.")
        elif total >= 60:
            recs.insert(0, "Content is decent but has clear improvement opportunities.")
        else:
            recs.insert(0, "Content needs significant improvements before it can compete effectively.")

        return recs

    def check_readability(self, text: str) -> dict:
        """Calculate readability metrics (Flesch Reading Ease, sentence count, avg words/sentence)."""
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]
        words = text.split()
        if not sentences or not words:
            return {"flesch_score": 0, "sentences": 0, "words": 0, "avg_sentence_length": 0}
        avg_sentence_len = len(words) / len(sentences)
        # Approximate syllable count
        syllables = sum(_count_syllables(w) for w in words)
        avg_syllables_per_word = syllables / len(words)
        flesch = 206.835 - 1.015 * avg_sentence_len - 84.6 * avg_syllables_per_word
        return {
            "flesch_score": round(max(0, min(100, flesch)), 1),
            "sentences": len(sentences),
            "words": len(words),
            "avg_sentence_length": round(avg_sentence_len, 1),
            "avg_syllables_per_word": round(avg_syllables_per_word, 2),
        }


def _count_syllables(word: str) -> int:
    """Approximate syllable count for a word."""
    word = word.lower().rstrip("aeiouy")
    return max(1, len(re.findall(r"[aeiou]+", word)))


class ContentHelper:
    """AI-powered content creation assistance."""

    def _call_openai(self, prompt: str, api_key: Optional[str] = None, max_tokens: int = 800) -> str:
        key = api_key or _OPENAI_KEY
        if not key:
            return ""
        try:
            import openai
            client = openai.OpenAI(api_key=key)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            print(f"OpenAI error: {exc}")
            return ""

    def generate_brief(self, keyword: str, intent: str, api_key: Optional[str] = None) -> dict:
        """Generate a detailed content brief for a target keyword."""
        if not (api_key or _OPENAI_KEY):
            return self._template_brief(keyword, intent)
        prompt = (
            f"Create a detailed SEO content brief for the keyword: '{keyword}' with {intent} intent.\n"
            "Include: target audience, primary keyword, secondary keywords, H1 suggestion, "
            "H2 headings outline (5-8), recommended word count, key points to cover, "
            "and what makes content rank for this keyword.\n"
            "Format as structured JSON with keys: title, target_audience, primary_keyword, "
            "secondary_keywords, h1, outline, word_count, key_points, notes."
        )
        response = self._call_openai(prompt, api_key, max_tokens=1200)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            return json.loads(response[start:end]) if start >= 0 else {"raw": response}
        except Exception:
            return {"raw": response, "keyword": keyword}

    def _template_brief(self, keyword: str, intent: str) -> dict:
        """Generate a template brief without AI."""
        return {
            "keyword": keyword,
            "intent": intent,
            "h1": f"The Complete Guide to {keyword.title()}",
            "word_count": 1500,
            "outline": [
                f"What is {keyword}?",
                f"Why {keyword} Matters",
                f"How to {keyword} Step by Step",
                "Best Practices",
                "Common Mistakes to Avoid",
                "Tools and Resources",
                "Conclusion",
            ],
            "note": "No AI key configured. Set OPENAI_API_KEY for AI-generated briefs.",
        }

    def generate_draft(
        self, brief: dict, word_count: int = 1000, api_key: Optional[str] = None
    ) -> str:
        """Generate a content draft based on a brief."""
        if not (api_key or _OPENAI_KEY):
            return f"[AI draft unavailable. Set OPENAI_API_KEY.]\n\nBrief: {json.dumps(brief, indent=2)}"
        outline = "\n".join(f"- {h}" for h in brief.get("outline", []))
        prompt = (
            f"Write a {word_count}-word SEO blog post for the keyword '{brief.get('keyword', '')}' "
            f"with intent: {brief.get('intent', 'informational')}.\n"
            f"Follow this outline:\n{outline}\n\n"
            "Write engaging, helpful content. Include the keyword naturally. "
            "Use subheadings, short paragraphs, and bullet points where appropriate."
        )
        return self._call_openai(prompt, api_key, max_tokens=2000)

    def generate_meta(
        self,
        url: str,
        content: str,
        keyword: str,
        api_key: Optional[str] = None,
    ) -> dict:
        """Generate SEO-optimized meta title and description."""
        if not (api_key or _OPENAI_KEY):
            words = content.split()[:20]
            return {
                "meta_title": f"{keyword.title()} - Complete Guide",
                "meta_description": " ".join(words) + "...",
                "note": "No AI key. Set OPENAI_API_KEY for AI-generated meta.",
            }
        prompt = (
            f"Generate an SEO meta title (max 60 chars) and meta description (max 160 chars) "
            f"for the keyword '{keyword}'. Page URL: {url}\n"
            f"Content preview: {content[:300]}\n\n"
            "Return JSON with keys: meta_title, meta_description."
        )
        response = self._call_openai(prompt, api_key, max_tokens=200)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            return json.loads(response[start:end]) if start >= 0 else {"raw": response}
        except Exception:
            return {"raw": response}

    def optimize_content(
        self, content: str, keyword: str, recommendations: list[str]
    ) -> str:
        """Apply recommendations to optimize content (returns improved version)."""
        if not _OPENAI_KEY:
            return f"[Set OPENAI_API_KEY to enable AI optimization]\n\nOriginal:\n{content}"
        recs = "\n".join(f"- {r}" for r in recommendations[:5])
        prompt = (
            f"Optimize the following content for keyword '{keyword}'.\n"
            f"Apply these improvements:\n{recs}\n\n"
            f"Content:\n{content[:2000]}\n\n"
            "Return the improved version only."
        )
        try:
            import openai
            client = openai.OpenAI(api_key=_OPENAI_KEY)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
            )
            return resp.choices[0].message.content or content
        except Exception as exc:
            print(f"Optimization error: {exc}")
            return content


class ContentInventory:
    """Manage and analyze content inventory for a project."""

    def sync_from_crawl(self, db_path: str, crawl_run_id: Optional[int] = None) -> list[dict]:
        """Sync content inventory from crawl results."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            query = "SELECT url, title, word_count FROM crawl_results WHERE status=200"
            if crawl_run_id:
                query += f" AND crawl_run_id={crawl_run_id}"
            cur = conn.execute(query)
            pages = [dict(r) for r in cur.fetchall()]
        except Exception:
            pages = []

        for page in pages:
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO content_inventory (url, title, word_count, status)
                       VALUES (?, ?, ?, 'published')""",
                    (page.get("url"), page.get("title"), page.get("word_count", 0)),
                )
            except Exception:
                pass
        conn.commit()
        conn.close()
        print(f"Synced {len(pages)} pages to content inventory.")
        return pages

    def detect_decay(
        self,
        db_path: str,
        project_id: Optional[int] = None,
        gsc_property_id: Optional[int] = None,
    ) -> list[dict]:
        """Detect content decay using GSC data or crawl history."""
        if gsc_property_id:
            from .gsc_integration import GSCClient
            client = GSCClient()
            return client.detect_content_decay(db_path, gsc_property_id)
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            cur = conn.execute(
                """SELECT * FROM content_inventory WHERE status='published'
                   ORDER BY created_at DESC LIMIT 100"""
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

    def get_author_performance(self, db_path: str, project_id: Optional[int] = None) -> list[dict]:
        """Return performance metrics by author."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            cur = conn.execute(
                """SELECT author, COUNT(*) as articles, AVG(word_count) as avg_words
                   FROM content_inventory WHERE author IS NOT NULL
                   GROUP BY author ORDER BY articles DESC"""
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def cmd_explorer(db_path: str, query: str, filters: Optional[dict] = None) -> None:
    """Search and index content."""
    explorer = ContentExplorer()
    if query.startswith("http"):
        print(f"Indexing: {query}", flush=True)
        data = explorer.index_url(query)
        print(json.dumps(data, indent=2))
    else:
        print(f"Finding trending topics for: {query}", flush=True)
        topics = explorer.find_trending_topics(query)
        for t in topics[:10]:
            print(f"  {t.get('title', '')}")


def cmd_grade(db_path: str, url: str, keyword: str) -> None:
    """Grade content quality."""
    grader = ContentGrader()
    print(f"Grading: {url} for keyword '{keyword}'...", flush=True)
    result = grader.grade_content(url, keyword)

    print(f"\nContent Grade: {result['score']}/100")
    print(f"\nBreakdown:")
    for metric, score in result.get("details", {}).get("breakdown", {}).items():
        print(f"  {metric:<25}: {score}")

    print(f"\nReadability: Flesch={result['readability'].get('flesch_score', 0)}, "
          f"Words={result['readability'].get('words', 0)}")

    print(f"\nRecommendations:")
    for rec in result.get("recommendations", []):
        print(f"  • {rec}")


def cmd_brief(keyword: str, intent: str = "informational", api_key: Optional[str] = None) -> None:
    """Generate a content brief."""
    helper = ContentHelper()
    print(f"Generating brief for: {keyword} ({intent})...", flush=True)
    brief = helper.generate_brief(keyword, intent, api_key)
    print(json.dumps(brief, indent=2))


def cmd_inventory(db_path: str, project_id: Optional[int] = None) -> None:
    """Show content inventory."""
    inventory = ContentInventory()
    pages = inventory.sync_from_crawl(db_path)
    authors = inventory.get_author_performance(db_path, project_id)
    if authors:
        print(f"\nAuthor Performance:")
        for a in authors:
            print(f"  {a.get('author', 'Unknown'):<30} {a.get('articles', 0)} articles, "
                  f"avg {a.get('avg_words', 0):.0f} words")


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for content command."""
    parser = argparse.ArgumentParser(description="Content Tools")
    parser.add_argument("subcommand", choices=["explorer", "grade", "brief", "inventory"])
    parser.add_argument("--db", default="report.db")
    parser.add_argument("--query", default="")
    parser.add_argument("--url", default="")
    parser.add_argument("--keyword", default="")
    parser.add_argument("--intent", default="informational")
    parser.add_argument("--project", type=int, dest="project_id")
    parser.add_argument("--api-key", dest="api_key")
    parsed = parser.parse_args(args)

    if parsed.subcommand == "explorer":
        cmd_explorer(parsed.db, parsed.query or parsed.url)
    elif parsed.subcommand == "grade":
        if not parsed.url or not parsed.keyword:
            print("Provide --url and --keyword")
            return 1
        cmd_grade(parsed.db, parsed.url, parsed.keyword)
    elif parsed.subcommand == "brief":
        if not parsed.keyword:
            print("Provide --keyword")
            return 1
        cmd_brief(parsed.keyword, parsed.intent, parsed.api_key)
    elif parsed.subcommand == "inventory":
        cmd_inventory(parsed.db, parsed.project_id)
    return 0
