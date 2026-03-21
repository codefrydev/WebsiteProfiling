"""Local SEO: Google Business Profile, local rank tracking, citation management."""
import json
import os
from datetime import date, datetime
from typing import Optional


class GBPManager:
    """Manage Google Business Profile data."""

    def fetch_profile(self, place_id: str) -> dict:
        """Fetch GBP data via Places API."""
        api_key = os.getenv("GOOGLE_PLACES_API_KEY", "")
        if not api_key:
            return {"error": "GOOGLE_PLACES_API_KEY not configured", "place_id": place_id}
        try:
            import httpx
            fields = "name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,business_status,types"
            with httpx.Client(timeout=15) as client:
                resp = client.get(
                    "https://maps.googleapis.com/maps/api/place/details/json",
                    params={"place_id": place_id, "fields": fields, "key": api_key},
                )
            if resp.status_code == 200:
                result = resp.json().get("result", {})
                return {
                    "place_id": place_id,
                    "name": result.get("name", ""),
                    "address": result.get("formatted_address", ""),
                    "phone": result.get("formatted_phone_number", ""),
                    "website": result.get("website", ""),
                    "rating": result.get("rating", 0),
                    "review_count": result.get("user_ratings_total", 0),
                    "hours": result.get("opening_hours", {}).get("weekday_text", []),
                    "status": result.get("business_status", ""),
                    "categories": result.get("types", []),
                }
        except Exception as e:
            return {"error": str(e), "place_id": place_id}
        return {"place_id": place_id}

    def calculate_completeness(self, profile: dict) -> int:
        """Score GBP completeness 0–100."""
        fields = ["name", "address", "phone", "website", "rating", "hours", "categories"]
        filled = sum(1 for f in fields if profile.get(f))
        return int((filled / len(fields)) * 100)

    def save_profile(self, db_path: str, project_id: int, profile: dict) -> int:
        """Save GBP profile to DB."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        score = self.calculate_completeness(profile)
        cur = conn.execute(
            """INSERT OR REPLACE INTO gbp_profiles
               (project_id, google_place_id, name, address, phone, website,
                category, categories, hours, metrics, completeness_score, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                project_id,
                profile.get("place_id", ""),
                profile.get("name", ""),
                profile.get("address", ""),
                profile.get("phone", ""),
                profile.get("website", ""),
                profile.get("categories", [""])[0] if profile.get("categories") else "",
                json.dumps(profile.get("categories", [])),
                json.dumps(profile.get("hours", [])),
                json.dumps({"rating": profile.get("rating", 0), "review_count": profile.get("review_count", 0)}),
                score,
            ),
        )
        profile_id = cur.lastrowid
        conn.commit()
        conn.close()
        return profile_id

    def get_optimization_tips(self, profile: dict) -> list:
        """Return actionable GBP optimization tips."""
        tips = []
        if not profile.get("phone"):
            tips.append("Add a local phone number to your GBP profile")
        if not profile.get("website"):
            tips.append("Link your website to your GBP profile")
        if not profile.get("hours"):
            tips.append("Add business hours to improve local visibility")
        if profile.get("review_count", 0) < 10:
            tips.append("Encourage customers to leave reviews (aim for 10+)")
        if profile.get("rating", 0) < 4.0 and profile.get("review_count", 0) > 0:
            tips.append("Respond to negative reviews and address customer concerns")
        if not profile.get("categories") or len(profile.get("categories", [])) < 2:
            tips.append("Add additional relevant business categories")
        return tips


class LocalRankChecker:
    """Check local search rankings for keywords."""

    def check_local_rank(self, keyword: str, location: str, domain: str) -> dict:
        """Check local rank using DataForSEO or SerpAPI."""
        login = os.getenv("DATAFORSEO_LOGIN", "")
        password = os.getenv("DATAFORSEO_PASSWORD", "")
        serpapi_key = os.getenv("SERPAPI_KEY", "")

        if login and password:
            return self._dataforseo_local_rank(keyword, location, domain, login, password)
        if serpapi_key:
            return self._serpapi_local_rank(keyword, location, domain, serpapi_key)
        return {
            "keyword": keyword,
            "location": location,
            "domain": domain,
            "local_rank": None,
            "note": "Configure DATAFORSEO_LOGIN or SERPAPI_KEY for rank data",
        }

    def _dataforseo_local_rank(self, keyword: str, location: str, domain: str, login: str, password: str) -> dict:
        import base64
        import httpx
        credentials = base64.b64encode(f"{login}:{password}".encode()).decode()
        try:
            payload = [{"keyword": keyword, "location_name": location, "language_code": "en"}]
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    "https://api.dataforseo.com/v3/serp/google/maps/live/advanced",
                    headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                    json=payload,
                )
            if resp.status_code == 200:
                items = resp.json().get("tasks", [{}])[0].get("result", [{}])[0].get("items", [])
                for i, item in enumerate(items, 1):
                    if domain.lower() in str(item.get("website_url", "")).lower():
                        return {"keyword": keyword, "location": location, "domain": domain, "local_rank": i}
                return {"keyword": keyword, "location": location, "domain": domain, "local_rank": None, "total_results": len(items)}
        except Exception as e:
            return {"keyword": keyword, "location": location, "domain": domain, "error": str(e)}
        return {"keyword": keyword, "location": location, "domain": domain, "local_rank": None}

    def _serpapi_local_rank(self, keyword: str, location: str, domain: str, api_key: str) -> dict:
        try:
            import httpx
            with httpx.Client(timeout=20) as client:
                resp = client.get(
                    "https://serpapi.com/search",
                    params={"q": keyword, "location": location, "tbm": "lcl", "api_key": api_key},
                )
            if resp.status_code == 200:
                results = resp.json().get("local_results", [])
                for i, r in enumerate(results, 1):
                    if domain.lower() in str(r.get("website", "")).lower():
                        return {"keyword": keyword, "location": location, "domain": domain, "local_rank": i}
        except Exception as e:
            return {"keyword": keyword, "location": location, "domain": domain, "error": str(e)}
        return {"keyword": keyword, "location": location, "domain": domain, "local_rank": None}

    def save_rank(self, db_path: str, project_id: int, rank_data: dict) -> None:
        """Save local rank to history."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        conn.execute(
            """INSERT INTO local_rank_history
               (project_id, keyword, location, date, local_rank)
               VALUES (?, ?, ?, ?, ?)""",
            (
                project_id,
                rank_data.get("keyword", ""),
                rank_data.get("location", ""),
                date.today().isoformat(),
                rank_data.get("local_rank"),
            ),
        )
        conn.commit()
        conn.close()


class CitationManager:
    """Manage local business citations (NAP consistency)."""

    MAJOR_DIRECTORIES = [
        "yelp.com", "yellowpages.com", "manta.com", "bbb.org",
        "foursquare.com", "citysearch.com", "angi.com", "thumbtack.com",
        "houzz.com", "tripadvisor.com", "facebook.com", "bing.com/maps",
    ]

    def check_citations(self, business_name: str, address: str, phone: str) -> list:
        """Check citation presence across major directories."""
        try:
            import requests
            from bs4 import BeautifulSoup
        except ImportError:
            return [{"error": "requests/beautifulsoup4 not installed"}]

        results = []
        query = f'"{business_name}" "{phone}"'
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CitationChecker/1.0)"}
        for directory in self.MAJOR_DIRECTORIES:
            results.append({
                "directory": directory,
                "status": "unchecked",
                "url": f"https://www.google.com/search?q={query}+site:{directory}",
                "nap_consistent": None,
            })
        return results

    def save_citations(self, db_path: str, project_id: int, citations: list) -> None:
        """Save citation records to DB."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        for c in citations:
            try:
                conn.execute(
                    """INSERT OR REPLACE INTO citations
                       (project_id, directory, url, nap_data, status, last_checked_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                    (
                        project_id,
                        c.get("directory", ""),
                        c.get("url", ""),
                        json.dumps(c.get("nap_data", {})),
                        c.get("status", "unchecked"),
                    ),
                )
            except Exception:
                pass
        conn.commit()
        conn.close()

    def nap_audit(self, db_path: str, project_id: int) -> dict:
        """Audit NAP consistency across saved citations."""
        from src.db import get_connection
        conn = get_connection(db_path)
        cur = conn.execute(
            "SELECT * FROM citations WHERE project_id=?", (project_id,)
        )
        citations = [dict(r) for r in cur.fetchall()]
        conn.close()
        consistent = sum(1 for c in citations if c.get("nap_consistent") == 1)
        issues = [c for c in citations if c.get("status") == "inconsistent"]
        return {
            "total": len(citations),
            "consistent": consistent,
            "issues": len(issues),
            "issue_list": issues[:10],
        }


def cmd_profile(db_path: str, place_id: str, project_id: int = 1):
    manager = GBPManager()
    print(f"Fetching GBP profile for place_id={place_id}...")
    profile = manager.fetch_profile(place_id)
    if "error" in profile:
        print(f"  Error: {profile['error']}")
        return
    profile_id = manager.save_profile(db_path, project_id, profile)
    print(f"  Name     : {profile.get('name')}")
    print(f"  Address  : {profile.get('address')}")
    print(f"  Rating   : {profile.get('rating')} ({profile.get('review_count')} reviews)")
    print(f"  Complete : {manager.calculate_completeness(profile)}%")
    tips = manager.get_optimization_tips(profile)
    if tips:
        print(f"\nOptimization tips:")
        for tip in tips:
            print(f"  - {tip}")


def cmd_rank(db_path: str, keyword: str, location: str, domain: str, project_id: int = 1):
    checker = LocalRankChecker()
    print(f"Checking local rank: '{keyword}' in '{location}'...")
    result = checker.check_local_rank(keyword, location, domain)
    rank = result.get("local_rank")
    if rank:
        print(f"  Local Rank: #{rank} for '{domain}'")
        checker.save_rank(db_path, project_id, result)
    else:
        print(f"  Not found in local results. {result.get('note', result.get('error', ''))}")


def cmd_citations(db_path: str, business_name: str, address: str, phone: str, project_id: int = 1):
    manager = CitationManager()
    print(f"Checking citations for '{business_name}'...")
    citations = manager.check_citations(business_name, address, phone)
    manager.save_citations(db_path, project_id, citations)
    print(f"Found {len(citations)} directories to check:")
    for c in citations[:10]:
        print(f"  [{c['status']:10}] {c['directory']}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Local SEO Tools")
    sub = parser.add_subparsers(dest="cmd")

    prof_p = sub.add_parser("profile", help="Fetch and analyze GBP profile")
    prof_p.add_argument("--place-id", required=True)
    prof_p.add_argument("--project-id", type=int, default=1)

    rank_p = sub.add_parser("rank", help="Check local search ranking")
    rank_p.add_argument("--keyword", required=True)
    rank_p.add_argument("--location", required=True)
    rank_p.add_argument("--domain", required=True)
    rank_p.add_argument("--project-id", type=int, default=1)

    cit_p = sub.add_parser("citations", help="Check citations across directories")
    cit_p.add_argument("--business", required=True, dest="business_name")
    cit_p.add_argument("--address", required=True)
    cit_p.add_argument("--phone", required=True)
    cit_p.add_argument("--project-id", type=int, default=1)

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "profile":
        cmd_profile(db, parsed.place_id, parsed.project_id)
    elif parsed.cmd == "rank":
        cmd_rank(db, parsed.keyword, parsed.location, parsed.domain, parsed.project_id)
    elif parsed.cmd == "citations":
        cmd_citations(db, parsed.business_name, parsed.address, parsed.phone, parsed.project_id)
    else:
        parser.print_help()
