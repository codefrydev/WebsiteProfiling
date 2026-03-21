import httpx
import base64
from typing import Optional
from app.core.config import settings


class DataForSEOClient:
    BASE_URL = "https://api.dataforseo.com/v3"

    def __init__(self):
        login = settings.DATAFORSEO_LOGIN or ""
        password = settings.DATAFORSEO_PASSWORD or ""
        creds = f"{login}:{password}"
        self.auth = base64.b64encode(creds.encode()).decode()
        self.headers = {
            "Authorization": f"Basic {self.auth}",
            "Content-Type": "application/json",
        }

    async def _post(self, endpoint: str, payload: list) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.BASE_URL}{endpoint}",
                json=payload,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_keywords_data(self, keywords: list[str], location: str = "United States") -> list[dict]:
        payload = [{"keywords": keywords, "location_name": location, "language_name": "English"}]
        try:
            data = await self._post("/keywords_data/google_ads/search_volume/live", payload)
            tasks = data.get("tasks", [])
            results = []
            for task in tasks:
                for item in (task.get("result") or []):
                    results.append({
                        "keyword": item.get("keyword", ""),
                        "volume": item.get("search_volume", 0),
                        "cpc": item.get("cpc", 0.0),
                        "competition": item.get("competition", 0.0),
                        "trend": item.get("monthly_searches", []),
                    })
            return results
        except Exception:
            return [{"keyword": kw, "volume": 0, "cpc": 0.0, "competition": 0.0, "trend": []} for kw in keywords]

    async def get_serp_results(self, keyword: str, location: str = "United States", device: str = "desktop") -> dict:
        payload = [{
            "keyword": keyword,
            "location_name": location,
            "language_name": "English",
            "device": device,
        }]
        try:
            data = await self._post("/serp/google/organic/live/advanced", payload)
            tasks = data.get("tasks", [])
            if tasks and tasks[0].get("result"):
                return tasks[0]["result"][0]
            return {}
        except Exception:
            return {}

    async def get_backlinks(self, domain: str) -> dict:
        payload = [{"target": domain, "limit": 100}]
        try:
            data = await self._post("/backlinks/backlinks/live", payload)
            tasks = data.get("tasks", [])
            if tasks and tasks[0].get("result"):
                return tasks[0]["result"][0]
            return {}
        except Exception:
            return {}

    async def get_domain_overview(self, domain: str) -> dict:
        payload = [{"target": domain}]
        try:
            data = await self._post("/dataforseo_labs/google/domain_rank_overview/live", payload)
            tasks = data.get("tasks", [])
            if tasks and tasks[0].get("result"):
                item = tasks[0]["result"][0]
                return {
                    "domain_authority": item.get("domain_rank", 0),
                    "organic_keywords": item.get("organic", {}).get("count", 0),
                    "organic_traffic_est": item.get("organic", {}).get("etv", 0),
                    "backlinks": item.get("backlinks", 0),
                    "referring_domains": item.get("referring_domains", 0),
                }
            return {}
        except Exception:
            return {}

    async def get_organic_keywords(self, domain: str, limit: int = 100) -> list[dict]:
        payload = [{"target": domain, "limit": limit, "order_by": ["etv,desc"]}]
        try:
            data = await self._post("/dataforseo_labs/google/ranked_keywords/live", payload)
            tasks = data.get("tasks", [])
            results = []
            for task in tasks:
                for item in (task.get("result") or []):
                    for kw_item in (item.get("items") or []):
                        results.append({
                            "keyword": kw_item.get("keyword_data", {}).get("keyword", ""),
                            "position": kw_item.get("ranked_serp_element", {}).get("serp_item", {}).get("rank_absolute", 0),
                            "volume": kw_item.get("keyword_data", {}).get("keyword_info", {}).get("search_volume", 0),
                            "url": kw_item.get("ranked_serp_element", {}).get("serp_item", {}).get("url", ""),
                        })
            return results
        except Exception:
            return []

    async def get_keyword_suggestions(self, seed: str, location: str = "United States") -> list[dict]:
        payload = [{"keyword": seed, "location_name": location, "language_name": "English", "limit": 100}]
        try:
            data = await self._post("/dataforseo_labs/google/keyword_suggestions/live", payload)
            tasks = data.get("tasks", [])
            results = []
            for task in tasks:
                for item in (task.get("result") or []):
                    for kw_item in (item.get("items") or []):
                        results.append({
                            "keyword": kw_item.get("keyword", ""),
                            "volume": kw_item.get("keyword_info", {}).get("search_volume", 0),
                            "cpc": kw_item.get("keyword_info", {}).get("cpc", 0.0),
                            "competition": kw_item.get("keyword_info", {}).get("competition", 0.0),
                            "difficulty": kw_item.get("keyword_properties", {}).get("keyword_difficulty", 0),
                        })
            return results
        except Exception:
            return []
