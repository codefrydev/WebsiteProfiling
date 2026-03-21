"""Brand monitoring and AI visibility tracking."""
import json
import re
import time
from datetime import datetime, date
from typing import Optional


class BrandMonitor:
    def scan_web_mentions(self, brand: str, db_path: str, project_id: int = 1) -> list:
        """Scrape Google News RSS and web for brand mentions."""
        try:
            import feedparser
            import requests
            from bs4 import BeautifulSoup
        except ImportError:
            print("Warning: feedparser/requests/bs4 not installed")
            return []

        mentions = []
        # Google News RSS
        feed_url = f"https://news.google.com/rss/search?q={brand.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:20]:
                context = entry.get("summary", "") or entry.get("title", "")
                mentions.append({
                    "project_id": project_id,
                    "brand_name": brand,
                    "source_url": entry.get("link", ""),
                    "date": date.today().isoformat(),
                    "context_text": context[:500],
                    "sentiment": self.detect_sentiment(context),
                    "mention_type": "news",
                    "is_linked": 0,
                })
        except Exception as e:
            print(f"  Google News RSS error: {e}")

        # Reddit RSS
        try:
            headers = {"User-Agent": "WebsiteProfiling/1.0 brand-scanner"}
            resp = requests.get(
                f"https://www.reddit.com/search.json?q={brand}&sort=new&limit=10",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                for post in data.get("data", {}).get("children", []):
                    p = post.get("data", {})
                    context = p.get("selftext", "") or p.get("title", "")
                    mentions.append({
                        "project_id": project_id,
                        "brand_name": brand,
                        "source_url": f"https://reddit.com{p.get('permalink', '')}",
                        "date": date.today().isoformat(),
                        "context_text": context[:500],
                        "sentiment": self.detect_sentiment(context),
                        "mention_type": "social",
                        "is_linked": 0,
                    })
        except Exception as e:
            print(f"  Reddit scan error: {e}")

        return mentions

    def detect_sentiment(self, text: str) -> str:
        """Simple keyword-based sentiment: positive/negative/neutral."""
        positive_words = ["great", "excellent", "amazing", "love", "best", "fantastic", "wonderful", "perfect"]
        negative_words = ["bad", "terrible", "awful", "hate", "worst", "horrible", "poor", "disappointing"]
        text_lower = text.lower()
        pos = sum(1 for w in positive_words if w in text_lower)
        neg = sum(1 for w in negative_words if w in text_lower)
        if pos > neg:
            return "positive"
        if neg > pos:
            return "negative"
        return "neutral"


class AIVisibilityTracker:
    def scan_chatgpt(self, brand: str, prompts: list, api_key: str) -> list:
        """Query ChatGPT with prompts and check if brand is mentioned."""
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        results = []
        for prompt in prompts:
            try:
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                )
                response_text = resp.choices[0].message.content
                brand_mentioned = brand.lower() in response_text.lower()
                results.append({
                    "platform": "chatgpt",
                    "prompt": prompt,
                    "brand_mentioned": brand_mentioned,
                    "response_text": response_text,
                    "date": date.today().isoformat(),
                    "sentiment": self.extract_sentiment(brand, response_text) if brand_mentioned else "neutral",
                })
            except Exception as e:
                results.append({"platform": "chatgpt", "prompt": prompt, "error": str(e)})
        return results

    def scan_claude(self, brand: str, prompts: list, api_key: str) -> list:
        """Query Claude with prompts and check if brand is mentioned."""
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        results = []
        for prompt in prompts:
            try:
                resp = client.messages.create(
                    model="claude-3-haiku-20240307",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": prompt}],
                )
                response_text = resp.content[0].text
                brand_mentioned = brand.lower() in response_text.lower()
                results.append({
                    "platform": "claude",
                    "prompt": prompt,
                    "brand_mentioned": brand_mentioned,
                    "response_text": response_text,
                    "date": date.today().isoformat(),
                    "sentiment": self.extract_sentiment(brand, response_text) if brand_mentioned else "neutral",
                })
            except Exception as e:
                results.append({"platform": "claude", "prompt": prompt, "error": str(e)})
        return results

    def get_standard_prompts(self, brand: str, industry: str = "technology") -> list:
        return [
            f"What are the best tools for {industry}?",
            f"Can you recommend {industry} platforms?",
            f"What do you know about {brand}?",
            f"What are alternatives to {brand}?",
            f"What is {brand} known for?",
        ]

    def extract_sentiment(self, brand: str, text: str) -> str:
        """Extract sentiment about brand from text."""
        monitor = BrandMonitor()
        sentences = [s for s in text.split(".") if brand.lower() in s.lower()]
        if sentences:
            return monitor.detect_sentiment(" ".join(sentences))
        return "neutral"


def cmd_scan_web(db_path: str, brand: str, project_id: int = 1):
    from src.db import get_connection, init_extended_schema, write_brand_mentions
    monitor = BrandMonitor()
    print(f"Scanning web for mentions of '{brand}'...")
    mentions = monitor.scan_web_mentions(brand, db_path, project_id)
    conn = get_connection(db_path)
    init_extended_schema(conn)
    write_brand_mentions(conn, mentions)
    conn.close()
    print(f"Found {len(mentions)} mentions")
    for m in mentions[:5]:
        print(f"  [{m.get('sentiment', '?')}] {m.get('source_url', '')}")


def cmd_scan_ai(db_path: str, brand: str, project_id: int = 1, openai_key: str = None, anthropic_key: str = None):
    from src.db import get_connection, init_extended_schema, write_ai_citations
    tracker = AIVisibilityTracker()
    prompts = tracker.get_standard_prompts(brand)
    all_citations = []
    if openai_key:
        print("Scanning ChatGPT...")
        all_citations.extend(tracker.scan_chatgpt(brand, prompts, openai_key))
    if anthropic_key:
        print("Scanning Claude...")
        all_citations.extend(tracker.scan_claude(brand, prompts, anthropic_key))
    if not openai_key and not anthropic_key:
        print("No API keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.")
        return

    conn = get_connection(db_path)
    init_extended_schema(conn)
    write_ai_citations(conn, all_citations)
    conn.close()

    mentioned = sum(1 for c in all_citations if c.get("brand_mentioned"))
    print(f"\nAI Visibility: {mentioned}/{len(all_citations)} responses mentioned '{brand}'")


def cmd_report(db_path: str, brand: str = None):
    from src.db import get_connection, read_brand_mentions, read_ai_citations
    conn = get_connection(db_path)
    mentions = read_brand_mentions(conn)
    citations = read_ai_citations(conn)
    conn.close()
    print(f"Brand Mentions: {len(mentions)}")
    sentiment_counts = {}
    for m in mentions:
        s = m.get("sentiment", "neutral")
        sentiment_counts[s] = sentiment_counts.get(s, 0) + 1
    for s, c in sentiment_counts.items():
        print(f"  {s}: {c}")
    print(f"\nAI Citations: {len(citations)}")
    mentioned = sum(1 for c in citations if c.get("brand_mentioned"))
    print(f"  Mentioned: {mentioned}/{len(citations)}")


def main(args=None):
    import argparse
    import os
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Brand Radar")
    sub = parser.add_subparsers(dest="cmd")
    web_p = sub.add_parser("scan-web", help="Scan web for brand mentions")
    web_p.add_argument("--brand", required=True)
    web_p.add_argument("--project-id", type=int, default=1)
    ai_p = sub.add_parser("scan-ai", help="Scan AI models for brand visibility")
    ai_p.add_argument("--brand", required=True)
    ai_p.add_argument("--project-id", type=int, default=1)
    rep_p = sub.add_parser("report", help="Show brand mentions report")
    rep_p.add_argument("--brand", default=None)
    parsed = parser.parse_args(args)

    db = os.getenv("DB_PATH", "report.db")
    if parsed.cmd == "scan-web":
        cmd_scan_web(db, parsed.brand, parsed.project_id)
    elif parsed.cmd == "scan-ai":
        cmd_scan_ai(
            db,
            parsed.brand,
            parsed.project_id,
            openai_key=os.getenv("OPENAI_API_KEY"),
            anthropic_key=os.getenv("ANTHROPIC_API_KEY"),
        )
    elif parsed.cmd == "report":
        cmd_report(db, parsed.brand)
    else:
        parser.print_help()
