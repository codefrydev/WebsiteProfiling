"""PPC/advertising analytics and ad copy generation."""
import json
import os
from typing import Optional


class PPCAnalyzer:
    """Research PPC keywords and analyze competitor ads."""

    def research_ppc_keywords(self, seed_keywords: list, db_path: str = None) -> list:
        """Research PPC keywords via DataForSEO or free alternatives."""
        login = os.getenv("DATAFORSEO_LOGIN", "")
        password = os.getenv("DATAFORSEO_PASSWORD", "")
        if login and password:
            return self._dataforseo_keywords(seed_keywords, login, password)
        return self._estimate_keywords(seed_keywords)

    def _dataforseo_keywords(self, keywords: list, login: str, password: str) -> list:
        """Fetch keyword CPC and competition data from DataForSEO."""
        import base64
        import httpx
        credentials = base64.b64encode(f"{login}:{password}".encode()).decode()
        results = []
        try:
            payload = [{"keywords": keywords, "language_code": "en", "location_code": 2840}]
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
                    headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                    json=payload,
                )
            if resp.status_code == 200:
                data = resp.json()
                for task in data.get("tasks", []):
                    for item in (task.get("result") or []):
                        results.append({
                            "keyword": item.get("keyword", ""),
                            "volume": item.get("search_volume", 0),
                            "cpc": item.get("cpc", 0.0),
                            "competition": item.get("competition", 0.0),
                            "competition_level": item.get("competition_level", "UNKNOWN"),
                        })
        except Exception as e:
            print(f"  DataForSEO error: {e}")
        return results or self._estimate_keywords(keywords)

    def _estimate_keywords(self, keywords: list) -> list:
        """Return placeholder data when APIs unavailable."""
        return [
            {
                "keyword": kw,
                "volume": 0,
                "cpc": 0.0,
                "competition": 0.0,
                "competition_level": "UNKNOWN",
                "note": "Configure DATAFORSEO_LOGIN for real data",
            }
            for kw in keywords
        ]

    def get_competitor_ads(self, domain: str) -> list:
        """Fetch competitor ads from DataForSEO or return placeholder."""
        login = os.getenv("DATAFORSEO_LOGIN", "")
        password = os.getenv("DATAFORSEO_PASSWORD", "")
        if not login:
            return [{"domain": domain, "note": "Configure DATAFORSEO_LOGIN for competitor ad data"}]
        import base64
        import httpx
        credentials = base64.b64encode(f"{login}:{password}".encode()).decode()
        try:
            with httpx.Client(timeout=20) as client:
                resp = client.post(
                    "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_metrics_by_categories/live",
                    headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                    json=[{"target": domain, "language_code": "en", "location_code": 2840}],
                )
            if resp.status_code == 200:
                return resp.json().get("tasks", [{}])[0].get("result", [])
        except Exception as e:
            print(f"  Competitor ads error: {e}")
        return []

    def estimate_ad_spend(self, domain: str) -> dict:
        """Estimate monthly ad spend for a domain."""
        ads = self.get_competitor_ads(domain)
        if not ads:
            return {"domain": domain, "estimated_monthly_spend": 0, "paid_keywords_count": 0}
        total_spend = sum(a.get("etv", 0) for a in ads)
        return {
            "domain": domain,
            "estimated_monthly_spend": round(total_spend, 2),
            "paid_keywords_count": len(ads),
        }

    def save_ppc_keywords(self, db_path: str, project_id: int, keywords: list) -> None:
        """Save researched PPC keywords to DB."""
        from src.db import get_connection, init_extended_schema
        conn = get_connection(db_path)
        init_extended_schema(conn)
        for kw in keywords:
            try:
                conn.execute(
                    """INSERT OR REPLACE INTO ppc_keywords
                       (project_id, keyword, cpc, competition, volume)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        project_id,
                        kw.get("keyword", ""),
                        kw.get("cpc", 0),
                        kw.get("competition", 0),
                        kw.get("volume", 0),
                    ),
                )
            except Exception:
                pass
        conn.commit()
        conn.close()


class AIAdCopyGenerator:
    """Generate ad copy using OpenAI."""

    def generate_search_ads(self, keyword: str, landing_page_url: str,
                             business_description: str, count: int = 3) -> list:
        """Generate Google Search Ads (headlines + descriptions)."""
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            return [{"error": "OPENAI_API_KEY not configured"}]
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            prompt = (
                f"Generate {count} Google Search Ads for the keyword: '{keyword}'\n"
                f"Business: {business_description}\n"
                f"Landing page: {landing_page_url}\n\n"
                "For each ad provide:\n"
                "- 3 headlines (max 30 chars each)\n"
                "- 2 descriptions (max 90 chars each)\n"
                "- Display URL path\n\n"
                "Return as JSON array."
            )
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            result = json.loads(resp.choices[0].message.content)
            return result.get("ads", [result])
        except Exception as e:
            return [{"error": str(e)}]

    def generate_display_ads(self, product: str, audience: str, tone: str = "professional") -> dict:
        """Generate display ad copy (short, medium, long variants)."""
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            return {"error": "OPENAI_API_KEY not configured"}
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            prompt = (
                f"Generate display ad copy for:\n"
                f"Product/Service: {product}\n"
                f"Target Audience: {audience}\n"
                f"Tone: {tone}\n\n"
                "Provide:\n"
                "- short_headline (max 25 chars)\n"
                "- long_headline (max 90 chars)\n"
                "- description (max 90 chars)\n"
                "- cta (call to action, max 15 chars)\n\n"
                "Return as JSON object."
            )
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            return {"error": str(e)}

    def generate_responsive_search_ad(self, keyword: str, unique_selling_points: list) -> dict:
        """Generate RSA with multiple headline and description variants."""
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            return {"error": "OPENAI_API_KEY not configured"}
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            usps = "\n".join(f"- {usp}" for usp in unique_selling_points)
            prompt = (
                f"Generate a Responsive Search Ad for keyword: '{keyword}'\n\n"
                f"Unique Selling Points:\n{usps}\n\n"
                "Generate:\n"
                "- 15 headlines (each max 30 chars)\n"
                "- 4 descriptions (each max 90 chars)\n\n"
                "Return JSON with 'headlines' array and 'descriptions' array."
            )
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            return {"error": str(e)}


def cmd_research(db_path: str, keywords: list, project_id: int = 1):
    analyzer = PPCAnalyzer()
    print(f"Researching {len(keywords)} PPC keywords...")
    results = analyzer.research_ppc_keywords(keywords, db_path)
    analyzer.save_ppc_keywords(db_path, project_id, results)
    print(f"\n{'Keyword':<40} {'Volume':>8}  {'CPC':>8}  {'Competition'}")
    print("-" * 70)
    for r in results:
        note = f"  [{r['note']}]" if r.get("note") else ""
        print(f"{r['keyword']:<40} {r.get('volume', 0):>8,}  ${r.get('cpc', 0):>7.2f}  {r.get('competition_level', 'N/A')}{note}")


def cmd_competitor_ads(db_path: str, domain: str):
    analyzer = PPCAnalyzer()
    print(f"Fetching ads for {domain}...")
    spend = analyzer.estimate_ad_spend(domain)
    print(f"  Est. Monthly Ad Spend: ${spend.get('estimated_monthly_spend', 0):,.2f}")
    print(f"  Paid Keywords       : {spend.get('paid_keywords_count', 0):,}")


def cmd_generate_ads(keyword: str, url: str, description: str):
    generator = AIAdCopyGenerator()
    print(f"Generating search ads for '{keyword}'...")
    ads = generator.generate_search_ads(keyword, url, description)
    for i, ad in enumerate(ads, 1):
        if "error" in ad:
            print(f"  Error: {ad['error']}")
            break
        print(f"\nAd {i}:")
        for h in ad.get("headlines", []):
            print(f"  Headline: {h}")
        for d in ad.get("descriptions", []):
            print(f"  Desc    : {d}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Advertising Analytics & Ad Copy")
    sub = parser.add_subparsers(dest="cmd")

    res_p = sub.add_parser("research", help="Research PPC keywords")
    res_p.add_argument("keywords", nargs="+")
    res_p.add_argument("--project-id", type=int, default=1)

    comp_p = sub.add_parser("competitor-ads", help="Analyze competitor ad spend")
    comp_p.add_argument("--domain", required=True)

    gen_p = sub.add_parser("generate", help="Generate AI ad copy")
    gen_p.add_argument("--keyword", required=True)
    gen_p.add_argument("--url", required=True)
    gen_p.add_argument("--description", required=True)

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "research":
        cmd_research(db, parsed.keywords, parsed.project_id)
    elif parsed.cmd == "competitor-ads":
        cmd_competitor_ads(db, parsed.domain)
    elif parsed.cmd == "generate":
        cmd_generate_ads(parsed.keyword, parsed.url, parsed.description)
    else:
        parser.print_help()
