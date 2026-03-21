"""
Rank Tracker: track keyword positions in search results over time.

Usage:
    python -m src rank-tracker add    --keywords "seo tool,rank tracker" --project 1
    python -m src rank-tracker check  --project 1
    python -m src rank-tracker history --keyword-id 5 --days 30
    python -m src rank-tracker report  --project 1

Requires SERP_API_KEY or DATAFORSEO_LOGIN/PASSWORD in environment or .env file.
Falls back to Google Suggest scraping when no API keys are configured.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, timedelta
from typing import Any, Optional
from urllib.parse import quote_plus, urlencode

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .db import (
    get_connection,
    init_extended_schema,
    read_tracked_keywords,
    write_rank_history,
    write_tracked_keywords,
)

_SERP_API_KEY = os.getenv("SERP_API_KEY", "")
_DFS_LOGIN = os.getenv("DATAFORSEO_LOGIN", "")
_DFS_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "")

_VISIBILITY_WEIGHTS = {1: 1.0, 2: 0.85, 3: 0.7, 4: 0.6, 5: 0.5,
                       6: 0.4, 7: 0.35, 8: 0.3, 9: 0.25, 10: 0.2}


class RankChecker:
    """Check keyword positions in search results via API or scraping."""

    def __init__(self, timeout: int = 15, delay: float = 1.0) -> None:
        self.timeout = timeout
        self.delay = delay
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; WebsiteProfiler/1.0)"
        })

    def check_keyword(
        self,
        keyword: str,
        location: str = "United States",
        device: str = "desktop",
        language: str = "en",
    ) -> dict:
        """Check position for a single keyword. Returns dict with position, url, serp_features."""
        if _DFS_LOGIN and _DFS_PASSWORD:
            return self._check_via_dataforseo(keyword, location, device, language)
        if _SERP_API_KEY:
            return self._check_via_serpapi(keyword, location, device)
        return self._check_via_scrape(keyword, location, device)

    def _check_via_serpapi(self, keyword: str, location: str, device: str) -> dict:
        """Use SerpApi to get SERP results."""
        params = {
            "q": keyword,
            "location": location,
            "device": device,
            "api_key": _SERP_API_KEY,
            "num": 10,
        }
        try:
            r = self._session.get(
                "https://serpapi.com/search", params=params, timeout=self.timeout
            )
            r.raise_for_status()
            data = r.json()
            results = data.get("organic_results", [])
            features = [k for k in data if k.endswith("_results") and k != "organic_results"]
            return {
                "position": results[0].get("position") if results else None,
                "url": results[0].get("link") if results else None,
                "serp_features": features,
                "results": results[:10],
            }
        except Exception as exc:
            return {"position": None, "url": None, "serp_features": [], "error": str(exc)}

    def _check_via_dataforseo(
        self, keyword: str, location: str, device: str, language: str
    ) -> dict:
        """Use DataForSEO SERP API to check rankings."""
        payload = [{
            "keyword": keyword,
            "location_name": location,
            "language_code": language,
            "device": device,
            "depth": 10,
        }]
        try:
            r = self._session.post(
                "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
                auth=(_DFS_LOGIN, _DFS_PASSWORD),
                json=payload,
                timeout=self.timeout,
            )
            r.raise_for_status()
            data = r.json()
            task = data.get("tasks", [{}])[0]
            items = task.get("result", [{}])[0].get("items", []) if task.get("result") else []
            organic = [i for i in items if i.get("type") == "organic"]
            features = list({i.get("type") for i in items if i.get("type") != "organic"})
            return {
                "position": organic[0].get("rank_absolute") if organic else None,
                "url": organic[0].get("url") if organic else None,
                "serp_features": features,
                "results": organic[:10],
            }
        except Exception as exc:
            return {"position": None, "url": None, "serp_features": [], "error": str(exc)}

    def _check_via_scrape(self, keyword: str, location: str, device: str) -> dict:
        """Fallback: scrape Google (limited, rate-limited). Returns position estimate."""
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        }
        try:
            time.sleep(self.delay)
            url = f"https://www.google.com/search?q={quote_plus(keyword)}&num=10&hl=en"
            r = requests.get(url, headers=headers, timeout=self.timeout)
            r.raise_for_status()
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(r.text, "html.parser")
            links = []
            for a in soup.select("div.g a[href^='http']"):
                href = a.get("href", "")
                if href and "google.com" not in href:
                    links.append(href)
            return {
                "position": 1 if links else None,
                "url": links[0] if links else None,
                "serp_features": [],
                "results": [{"url": u, "position": i + 1} for i, u in enumerate(links[:10])],
                "note": "scraped - limited accuracy",
            }
        except Exception as exc:
            return {
                "position": None,
                "url": None,
                "serp_features": [],
                "error": str(exc),
                "note": "No API key configured and scraping failed.",
            }

    def check_all_keywords(self, db_path: str, project_id: Optional[int] = None) -> list[dict]:
        """Check current positions for all tracked keywords in the DB."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        keywords = read_tracked_keywords(conn, project_id)
        conn.close()

        results = []
        today = date.today().isoformat()
        for kw in keywords:
            print(f"  Checking: {kw['keyword']} ({kw.get('location', 'US')})...", flush=True)
            result = self.check_keyword(
                kw["keyword"],
                kw.get("location", "United States"),
                kw.get("device", "desktop"),
                kw.get("language", "en"),
            )
            result["tracked_keyword_id"] = kw["id"]
            result["keyword"] = kw["keyword"]
            result["date"] = today
            results.append(result)
            time.sleep(self.delay)

        conn = get_connection(db_path)
        write_rank_history(conn, results)
        conn.close()
        return results

    def calculate_visibility_score(self, rank_data: list[dict]) -> float:
        """Calculate visibility score (0-100) from a list of rank results.

        Uses weighted click-through rate model based on position.
        """
        if not rank_data:
            return 0.0
        total_weight = 0.0
        for entry in rank_data:
            pos = entry.get("position")
            if pos and isinstance(pos, int) and 1 <= pos <= 10:
                total_weight += _VISIBILITY_WEIGHTS.get(pos, 0)
        max_possible = len(rank_data) * 1.0
        return round((total_weight / max_possible) * 100, 2) if max_possible > 0 else 0.0

    def detect_cannibalization(self, db_path: str, project_id: Optional[int] = None) -> list[dict]:
        """Detect keyword cannibalization (multiple pages ranking for same keyword)."""
        conn = get_connection(db_path)
        init_extended_schema(conn)
        try:
            query = """
                SELECT tk.keyword, rh.url, rh.date, rh.position
                FROM rank_history rh
                JOIN tracked_keywords tk ON tk.id = rh.tracked_keyword_id
                WHERE rh.date = date('now')
                  AND rh.position IS NOT NULL
            """
            if project_id is not None:
                query += f" AND tk.project_id = {int(project_id)}"
            cur = conn.execute(query)
            rows = [dict(r) for r in cur.fetchall()]
        except Exception:
            rows = []
        conn.close()

        # Group by keyword, flag if multiple URLs appear
        from collections import defaultdict
        kw_urls: dict[str, list] = defaultdict(list)
        for r in rows:
            kw_urls[r["keyword"]].append(r)

        return [
            {"keyword": kw, "urls": entries}
            for kw, entries in kw_urls.items()
            if len({e["url"] for e in entries}) > 1
        ]

    def get_serp_snapshot(
        self,
        keyword: str,
        location: str = "United States",
        device: str = "desktop",
    ) -> dict:
        """Return full SERP snapshot for a keyword."""
        result = self.check_keyword(keyword, location, device)
        return {
            "keyword": keyword,
            "location": location,
            "device": device,
            "date": date.today().isoformat(),
            "results": result.get("results", []),
            "features": result.get("serp_features", []),
        }


# ---------------------------------------------------------------------------
# CLI command functions
# ---------------------------------------------------------------------------

def cmd_add_keywords(
    db_path: str,
    keywords: list[str],
    project_id: int = 1,
    location: str = "United States",
    device: str = "desktop",
) -> None:
    """Add keywords to the rank tracker database."""
    conn = get_connection(db_path)
    init_extended_schema(conn)
    kw_dicts = [
        {
            "project_id": project_id,
            "keyword": kw.strip(),
            "location": location,
            "device": device,
        }
        for kw in keywords
        if kw.strip()
    ]
    write_tracked_keywords(conn, kw_dicts)
    conn.close()
    print(f"Added {len(kw_dicts)} keyword(s) to project {project_id}.")


def cmd_check_rankings(db_path: str, project_id: Optional[int] = None) -> None:
    """Check current rankings for all tracked keywords."""
    print(f"Checking rankings for project {project_id or 'all'}...", flush=True)
    checker = RankChecker()
    results = checker.check_all_keywords(db_path, project_id)
    print(f"\nResults ({len(results)} keywords checked):")
    for r in results:
        pos = r.get("position", "?")
        kw = r.get("keyword", "")
        url = r.get("url", "")
        print(f"  [{pos:>3}] {kw}  ->  {url}")
    vis = checker.calculate_visibility_score(results)
    print(f"\nVisibility score: {vis}")


def cmd_show_history(
    db_path: str,
    keyword_id: Optional[int] = None,
    days: int = 30,
) -> None:
    """Show rank history for a keyword or all keywords."""
    from .db import read_rank_history
    conn = get_connection(db_path)
    init_extended_schema(conn)
    history = read_rank_history(conn, keyword_id, days)
    conn.close()

    if not history:
        print("No history found.")
        return
    print(f"Rank history ({len(history)} records, last {days} days):")
    for row in history[:50]:
        change = ""
        prev = row.get("previous_position")
        curr = row.get("position")
        if prev and curr:
            delta = prev - curr
            change = f" (↑{delta})" if delta > 0 else f" (↓{abs(delta)})" if delta < 0 else " (=)"
        print(f"  {row['date']}  pos={curr}{change}  kw_id={row['tracked_keyword_id']}")


def cmd_show_report(db_path: str, project_id: Optional[int] = None) -> None:
    """Show a summary report for a project's rank tracking."""
    conn = get_connection(db_path)
    init_extended_schema(conn)
    keywords = read_tracked_keywords(conn, project_id)
    from .db import read_rank_history
    history = read_rank_history(conn, days=30)
    conn.close()

    checker = RankChecker()
    # Get latest position per keyword
    latest: dict[int, dict] = {}
    for h in sorted(history, key=lambda x: x.get("date", "")):
        latest[h["tracked_keyword_id"]] = h

    print(f"Rank Tracker Report  (project={project_id or 'all'})")
    print(f"{'Keyword':<40} {'Pos':>5} {'Change':>8}")
    print("-" * 60)
    for kw in keywords:
        h = latest.get(kw["id"], {})
        pos = h.get("position", "-")
        prev = h.get("previous_position")
        if prev and isinstance(pos, int):
            delta = prev - pos
            change = f"+{delta}" if delta > 0 else str(delta) if delta < 0 else "="
        else:
            change = "new"
        print(f"  {kw['keyword']:<38} {str(pos):>5} {change:>8}")

    vis = checker.calculate_visibility_score(list(latest.values()))
    print(f"\nOverall visibility score: {vis}")


def main(args: Optional[list[str]] = None) -> int:
    """CLI entry point for rank-tracker command."""
    parser = argparse.ArgumentParser(description="Rank Tracker")
    parser.add_argument("subcommand", choices=["add", "check", "history", "report"])
    parser.add_argument("--db", default="report.db", help="Path to SQLite DB")
    parser.add_argument("--project", type=int, default=1)
    parser.add_argument("--keywords", help="Comma-separated keywords to add")
    parser.add_argument("--location", default="United States")
    parser.add_argument("--device", default="desktop")
    parser.add_argument("--keyword-id", type=int, dest="keyword_id")
    parser.add_argument("--days", type=int, default=30)
    parsed = parser.parse_args(args)

    if parsed.subcommand == "add":
        if not parsed.keywords:
            print("Provide --keywords", file=__import__("sys").stderr)
            return 1
        cmd_add_keywords(
            parsed.db,
            parsed.keywords.split(","),
            parsed.project,
            parsed.location,
            parsed.device,
        )
    elif parsed.subcommand == "check":
        cmd_check_rankings(parsed.db, parsed.project)
    elif parsed.subcommand == "history":
        cmd_show_history(parsed.db, parsed.keyword_id, parsed.days)
    elif parsed.subcommand == "report":
        cmd_show_report(parsed.db, parsed.project)
    return 0
