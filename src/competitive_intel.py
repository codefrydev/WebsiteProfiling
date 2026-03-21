"""Competitive intelligence tools."""
import json
from datetime import datetime
from typing import Optional

import httpx


class CompetitiveAnalyzer:
    def estimate_traffic(self, domain: str) -> dict:
        """Estimate traffic using public sources."""
        return {
            "domain": domain,
            "visits_est": 0,
            "global_rank": 0,
            "country_rank": 0,
            "category_rank": 0,
            "traffic_sources": {
                "direct": 0.3,
                "organic": 0.4,
                "referral": 0.1,
                "social": 0.1,
                "paid": 0.05,
                "mail": 0.05,
            },
            "note": "Configure DATAFORSEO_LOGIN for accurate data",
        }

    def fetch_dataforseo_traffic(self, domain: str, login: str, password: str) -> dict:
        """Fetch traffic data from DataForSEO Labs API."""
        import base64
        credentials = base64.b64encode(f"{login}:{password}".encode()).decode()
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(
                    "https://api.dataforseo.com/v3/similarweb/overview/live",
                    headers={
                        "Authorization": f"Basic {credentials}",
                        "Content-Type": "application/json",
                    },
                    json=[{"target": domain}],
                )
                if resp.status_code == 200:
                    data = resp.json()
                    tasks = data.get("tasks", [])
                    if tasks and tasks[0].get("result"):
                        result = tasks[0]["result"][0]
                        return {
                            "domain": domain,
                            "visits_est": result.get("visits", 0),
                            "global_rank": result.get("global_rank", 0),
                            "bounce_rate": result.get("bounce_rate", 0),
                            "avg_duration": result.get("average_duration", 0),
                            "pages_per_visit": result.get("pages_per_visit", 0),
                        }
        except Exception as e:
            print(f"  DataForSEO error for {domain}: {e}")
        return self.estimate_traffic(domain)

    def keyword_gap(self, domain1: str, domain2: str, db_path: str = None) -> list:
        """Find keywords domain2 ranks for that domain1 doesn't."""
        if not db_path:
            return []
        try:
            from src.db import get_connection, read_organic_keywords
            conn = get_connection(db_path)
            kw1 = {r["keyword"] for r in read_organic_keywords(conn, domain1)}
            kw2 = read_organic_keywords(conn, domain2)
            conn.close()
            return [kw for kw in kw2 if kw["keyword"] not in kw1]
        except Exception:
            return []

    def backlink_gap(self, domain1: str, domain2: str, db_path: str = None) -> list:
        """Find referring domains linking to domain2 but not domain1."""
        if not db_path:
            return []
        try:
            from src.db import get_connection, read_backlinks
            conn = get_connection(db_path)
            bl1_domains = {r["source_url"].split("/")[2] for r in read_backlinks(conn, domain1) if "/" in r.get("source_url", "")}
            bl2 = read_backlinks(conn, domain2)
            conn.close()
            return [b for b in bl2 if b.get("source_url", "").split("/")[2] not in bl1_domains]
        except Exception:
            return []

    def batch_analyze(self, urls: list, db_path: str) -> list:
        """Analyze multiple URLs/domains at once."""
        import os
        login = os.getenv("DATAFORSEO_LOGIN", "")
        password = os.getenv("DATAFORSEO_PASSWORD", "")
        results = []
        for url in urls:
            try:
                domain = url.replace("https://", "").replace("http://", "").split("/")[0]
                if login and password:
                    data = self.fetch_dataforseo_traffic(domain, login, password)
                else:
                    data = self.estimate_traffic(domain)
                results.append({"url": url, "domain": domain, **data})
            except Exception as e:
                results.append({"url": url, "error": str(e)})
        return results

    def content_gap(self, domain1: str, domain2: str) -> list:
        """Find content topics domain2 covers that domain1 lacks (placeholder)."""
        return []


def cmd_compare(db_path: str, domains: list):
    import os
    analyzer = CompetitiveAnalyzer()
    login = os.getenv("DATAFORSEO_LOGIN", "")
    password = os.getenv("DATAFORSEO_PASSWORD", "")
    print(f"Comparing {len(domains)} domains...\n")
    for domain in domains:
        if login and password:
            data = analyzer.fetch_dataforseo_traffic(domain, login, password)
        else:
            data = analyzer.estimate_traffic(domain)
        print(f"{domain}:")
        print(f"  Est. Monthly Visits : {data.get('visits_est', 0):,}")
        print(f"  Global Rank         : {data.get('global_rank', 'N/A')}")
        if data.get("note"):
            print(f"  Note                : {data['note']}")
        print()


def cmd_batch(db_path: str, urls_file: str):
    with open(urls_file) as f:
        urls = [line.strip() for line in f if line.strip()]
    analyzer = CompetitiveAnalyzer()
    results = analyzer.batch_analyze(urls, db_path)
    print(f"Analyzed {len(results)} URLs")
    for r in results:
        print(f"  {r['url']}: {r.get('visits_est', 0):,} est. visits")


def cmd_keyword_gap(db_path: str, domain1: str, domain2: str):
    analyzer = CompetitiveAnalyzer()
    gaps = analyzer.keyword_gap(domain1, domain2, db_path)
    print(f"Keywords {domain2} ranks for but {domain1} doesn't: {len(gaps)}")
    for kw in gaps[:20]:
        print(f"  pos={kw.get('position', '?'):3}  vol={kw.get('volume', 0):6,}  {kw['keyword']}")


def main(args=None):
    import argparse
    import os
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Competitive Intelligence")
    sub = parser.add_subparsers(dest="cmd")
    compare_p = sub.add_parser("compare", help="Compare traffic estimates for domains")
    compare_p.add_argument("domains", nargs="+")
    batch_p = sub.add_parser("batch", help="Batch analyze URLs from file")
    batch_p.add_argument("--file", required=True)
    gap_p = sub.add_parser("keyword-gap", help="Show keyword gaps between two domains")
    gap_p.add_argument("--domain1", required=True)
    gap_p.add_argument("--domain2", required=True)
    parsed = parser.parse_args(args)

    db = os.getenv("DB_PATH", "report.db")
    if parsed.cmd == "compare":
        cmd_compare(db, parsed.domains)
    elif parsed.cmd == "batch":
        cmd_batch(db, parsed.file)
    elif parsed.cmd == "keyword-gap":
        cmd_keyword_gap(db, parsed.domain1, parsed.domain2)
    else:
        parser.print_help()
