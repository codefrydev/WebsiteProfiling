"""Smoke-test v1 routes: expect 2xx/4xx, never 5xx for typical empty-DB + seeded project flows."""
import io

import pytest
from fastapi.testclient import TestClient


def assert_ok(status: int, path: str, body: str = ""):
    assert status < 500, f"{path} -> {status} {body[:500]}"


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200


def test_openapi(client: TestClient):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    data = r.json()
    assert data.get("openapi")
    paths = data.get("paths") or {}
    assert len(paths) > 10


def test_projects_crud(client: TestClient, project_id: int):
    r = client.get(f"/api/v1/projects/{project_id}")
    assert_ok(r.status_code, "get project", r.text)
    assert r.status_code == 200

    r = client.put(f"/api/v1/projects/{project_id}", json={"name": "Renamed"})
    assert_ok(r.status_code, "put project", r.text)
    assert r.status_code == 200


def test_rank_tracker(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/rank-tracker/keywords", params={"project_id": pid})
    assert_ok(r.status_code, "rt keywords", r.text)
    r = client.post(
        f"/api/v1/rank-tracker/keywords?project_id={pid}",
        json={"keywords": [{"keyword": "test kw", "location": "United States"}]},
    )
    assert_ok(r.status_code, "rt add", r.text)
    assert r.status_code == 201
    kid = r.json()[0]["id"]
    r = client.get("/api/v1/rank-tracker/history", params={"project_id": pid})
    assert_ok(r.status_code, "rt history", r.text)
    r = client.get(f"/api/v1/rank-tracker/history/{kid}")
    assert_ok(r.status_code, "rt hist kw", r.text)
    r = client.post("/api/v1/rank-tracker/check", params={"project_id": pid})
    assert_ok(r.status_code, "rt check", r.text)
    r = client.get("/api/v1/rank-tracker/visibility", params={"project_id": pid})
    assert_ok(r.status_code, "rt vis", r.text)
    r = client.get("/api/v1/rank-tracker/cannibalization", params={"project_id": pid})
    assert_ok(r.status_code, "rt canni", r.text)
    r = client.get(f"/api/v1/rank-tracker/serp/{kid}")
    assert_ok(r.status_code, "rt serp", r.text)


def test_keywords(client: TestClient, project_id: int):
    r = client.post("/api/v1/keywords/research", json={"seed": "coffee", "limit": 5})
    assert_ok(r.status_code, "kw research", r.text)
    r = client.get("/api/v1/keywords/search", params={"q": "coffee"})
    assert_ok(r.status_code, "kw search", r.text)
    r = client.post(
        f"/api/v1/keywords/cluster?project_id={project_id}",
        json={"name": "c", "keywords": ["a", "b"]},
    )
    assert_ok(r.status_code, "kw cluster", r.text)
    r = client.get("/api/v1/keywords/serp", params={"keyword": "coffee"})
    assert_ok(r.status_code, "kw serp", r.text)
    r = client.post("/api/v1/keywords/suggestions/ai", json={"seed": "coffee", "count": 3})
    assert_ok(r.status_code, "kw ai", r.text)
    r = client.get("/api/v1/keywords/questions", params={"seed": "coffee"})
    assert_ok(r.status_code, "kw q", r.text)
    r = client.get("/api/v1/keywords/related", params={"keyword": "coffee"})
    assert_ok(r.status_code, "kw rel", r.text)
    r = client.get("/api/v1/keywords/export", params={"project_id": project_id})
    assert_ok(r.status_code, "kw export", r.text)


def test_site_explorer(client: TestClient):
    d = "example.com"
    for path in [
        f"/api/v1/site-explorer/overview/{d}",
        f"/api/v1/site-explorer/backlinks/{d}",
        f"/api/v1/site-explorer/referring-domains/{d}",
        f"/api/v1/site-explorer/organic-keywords/{d}",
        f"/api/v1/site-explorer/paid-keywords/{d}",
        f"/api/v1/site-explorer/broken-backlinks/{d}",
        f"/api/v1/site-explorer/anchor-text/{d}",
    ]:
        r = client.get(path)
        assert_ok(r.status_code, path, r.text)
    r = client.get("/api/v1/site-explorer/content-gap", params={"target": d, "competitors": "other.com"})
    assert_ok(r.status_code, "cg", r.text)
    r = client.get(
        "/api/v1/site-explorer/link-intersect",
        params={"domains": "a.com,b.com"},
    )
    assert_ok(r.status_code, "li", r.text)
    r = client.post(f"/api/v1/site-explorer/fetch/{d}")
    assert_ok(r.status_code, "fetch", r.text)


def test_site_audit(client: TestClient, project_id: int):
    r = client.get("/api/v1/site-audit/projects")
    assert_ok(r.status_code, "sa list", r.text)
    r = client.post(
        "/api/v1/site-audit/projects",
        params={"project_id": project_id, "url": "https://example.com"},
    )
    assert_ok(r.status_code, "sa create", r.text)
    aid = r.json().get("job_id")
    r = client.get(f"/api/v1/site-audit/projects/{aid}")
    assert_ok(r.status_code, "sa get", r.text)
    r = client.get("/api/v1/site-audit/issues", params={"audit_id": aid})
    assert_ok(r.status_code, "sa issues", r.text)
    r = client.get("/api/v1/site-audit/issues/summary", params={"audit_id": aid})
    assert_ok(r.status_code, "sa sum", r.text)
    r = client.get("/api/v1/site-audit/crawls", params={"project_id": project_id})
    assert_ok(r.status_code, "sa crawls", r.text)
    r = client.post(
        "/api/v1/site-audit/crawls/start",
        params={"project_id": project_id, "url": "https://example.com"},
    )
    assert_ok(r.status_code, "sa start", r.text)
    r = client.get("/api/v1/site-audit/sitemap", params={"audit_id": aid})
    assert_ok(r.status_code, "sa sitemap", r.text)
    r = client.get("/api/v1/site-audit/custom-extraction", params={"audit_id": aid})
    assert_ok(r.status_code, "sa custom", r.text)
    files = {"file": ("test.log", io.BytesIO(b"line1\n"), "text/plain")}
    r = client.post(
        "/api/v1/site-audit/log-file",
        params={"project_id": project_id},
        files=files,
    )
    assert_ok(r.status_code, "sa log", r.text)


def test_gsc(client: TestClient, project_id: int):
    r = client.get("/api/v1/gsc/properties", params={"project_id": project_id})
    assert_ok(r.status_code, "gsc props", r.text)
    r = client.post(
        "/api/v1/gsc/properties",
        json={"project_id": project_id, "site_url": "https://example.com/"},
    )
    assert_ok(r.status_code, "gsc add", r.text)
    prop_id = r.json()["id"]
    for suffix in [
        f"/overview/{prop_id}",
        f"/queries/{prop_id}",
        f"/pages/{prop_id}",
        f"/devices/{prop_id}",
        f"/countries/{prop_id}",
        f"/cannibalization/{prop_id}",
        f"/low-hanging-fruit/{prop_id}",
        f"/decay/{prop_id}",
    ]:
        r = client.get(f"/api/v1/gsc{suffix}")
        assert_ok(r.status_code, suffix, r.text)
    r = client.post(f"/api/v1/gsc/sync/{prop_id}")
    assert_ok(r.status_code, "gsc sync", r.text)


def test_analytics(client: TestClient, project_id: int):
    r = client.post(
        "/api/v1/analytics/events",
        json={
            "site_id": str(project_id),
            "page_url": "/",
            "event_type": "pageview",
            "session_id": "s1",
        },
    )
    assert_ok(r.status_code, "an ev", r.text)
    pid = project_id
    for path, extra in [
        ("/api/v1/analytics/overview", {"project_id": pid}),
        ("/api/v1/analytics/pages", {"project_id": pid}),
        ("/api/v1/analytics/sources", {"project_id": pid}),
        ("/api/v1/analytics/devices", {"project_id": pid}),
        ("/api/v1/analytics/geo", {"project_id": pid}),
        ("/api/v1/analytics/realtime", {"project_id": pid}),
        ("/api/v1/analytics/ai-traffic", {"project_id": pid}),
        ("/api/v1/analytics/bots", {"project_id": pid}),
    ]:
        r = client.get(path, params=extra)
        assert_ok(r.status_code, path, r.text)
    r = client.get("/api/v1/analytics/funnels", params={"project_id": pid})
    assert_ok(r.status_code, "fun", r.text)
    r = client.get("/api/v1/analytics/goals", params={"project_id": pid})
    assert_ok(r.status_code, "goals", r.text)


def test_content(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/content/explorer", params={"q": "test"})
    assert_ok(r.status_code, "cex", r.text)
    r = client.post(
        f"/api/v1/content/score?project_id={pid}",
        json={"url": "https://example.com", "keyword": "kw"},
    )
    assert_ok(r.status_code, "cscore", r.text)
    r = client.get("/api/v1/content/inventory", params={"project_id": pid})
    assert_ok(r.status_code, "cinv", r.text)
    r = client.post("/api/v1/content/inventory/sync", params={"project_id": pid})
    assert_ok(r.status_code, "csync", r.text)
    r = client.get("/api/v1/content/inventory/decay", params={"project_id": pid})
    assert_ok(r.status_code, "cdec", r.text)
    r = client.post("/api/v1/content/ai/brief", json={"keyword": "kw"})
    assert_ok(r.status_code, "cbrief", r.text)
    r = client.post("/api/v1/content/ai/draft", json={"brief": {"title": "t"}, "length": 100})
    assert_ok(r.status_code, "cdraft", r.text)
    r = client.post(
        "/api/v1/content/ai/meta",
        json={"url": "https://x.com", "keyword": "k"},
    )
    assert_ok(r.status_code, "cmeta", r.text)
    r = client.post(
        "/api/v1/content/ai/optimize",
        json={"content": "hello", "keyword": "k"},
    )
    assert_ok(r.status_code, "copt", r.text)
    r = client.post("/api/v1/content/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert_ok(r.status_code, "cchat", r.text)
    r = client.get("/api/v1/content/topic-research", params={"project_id": pid})
    assert_ok(r.status_code, "ctopic", r.text)
    r = client.post(
        f"/api/v1/content/clusters?project_id={pid}",
        json={"urls": ["https://a.com"]},
    )
    assert_ok(r.status_code, "cclu", r.text)


def test_brand_radar(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/brand-radar/mentions", params={"project_id": pid})
    assert_ok(r.status_code, "br m", r.text)
    r = client.post(
        "/api/v1/brand-radar/mentions/scan?project_id=%d" % pid,
        json={"brand_name": "Acme", "keywords": []},
    )
    assert_ok(r.status_code, "br scan", r.text)
    r = client.get("/api/v1/brand-radar/ai-citations", params={"project_id": pid})
    assert_ok(r.status_code, "br ai", r.text)
    r = client.post(
        "/api/v1/brand-radar/ai-citations/scan?project_id=%d" % pid,
        json={"brand_name": "Acme", "llm_platforms": ["openai"], "prompts": []},
    )
    assert_ok(r.status_code, "br aiscan", r.text)
    r = client.get("/api/v1/brand-radar/ai-citations/prompts", params={"project_id": pid})
    assert_ok(r.status_code, "br pr", r.text)
    r = client.post(
        "/api/v1/brand-radar/ai-citations/prompts?project_id=%d" % pid,
        json={"prompt": "test", "category": None},
    )
    assert_ok(r.status_code, "br addp", r.text)
    r = client.get(
        "/api/v1/brand-radar/share-of-voice",
        params={"project_id": pid, "brand_name": "Acme"},
    )
    assert_ok(r.status_code, "br sov", r.text)
    r = client.get(
        "/api/v1/brand-radar/youtube",
        params={"project_id": pid, "brand_name": "Acme"},
    )
    assert_ok(r.status_code, "br yt", r.text)
    r = client.get(
        "/api/v1/brand-radar/competitors",
        params={"project_id": pid, "competitors": "A,B"},
    )
    assert_ok(r.status_code, "br comp", r.text)


def test_competitive(client: TestClient, project_id: int):
    d = "example.com"
    r = client.get(f"/api/v1/competitive/traffic/{d}")
    assert_ok(r.status_code, "co tr", r.text)
    r = client.post("/api/v1/competitive/compare", json={"domains": [d, "b.com"]})
    assert_ok(r.status_code, "co cmp", r.text)
    r = client.get(
        "/api/v1/competitive/keyword-gap",
        params={"target": d, "competitors": "b.com"},
    )
    assert_ok(r.status_code, "co kg", r.text)
    r = client.get(
        "/api/v1/competitive/backlink-gap",
        params={"target": d, "competitors": "b.com"},
    )
    assert_ok(r.status_code, "co bg", r.text)
    r = client.post(
        f"/api/v1/competitive/batch-analysis?project_id={project_id}",
        json={"urls": ["https://a.com"]},
    )
    assert_ok(r.status_code, "co batch", r.text)
    jid = r.json()["id"]
    r = client.get(f"/api/v1/competitive/batch-analysis/{jid}")
    assert_ok(r.status_code, "co bget", r.text)
    r = client.get("/api/v1/competitive/market-segments", params={"project_id": project_id})
    assert_ok(r.status_code, "co seg", r.text)
    r = client.post(
        f"/api/v1/competitive/market-segments?project_id={project_id}",
        json={"name": "seg1", "domains": [d]},
    )
    assert_ok(r.status_code, "co segc", r.text)
    sid = r.json()["id"]
    r = client.get(f"/api/v1/competitive/market-segments/{sid}")
    assert_ok(r.status_code, "co seg1", r.text)


def test_social(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/social/accounts", params={"project_id": pid})
    assert_ok(r.status_code, "so acc", r.text)
    r = client.post(
        "/api/v1/social/accounts",
        json={"project_id": pid, "platform": "twitter"},
    )
    assert_ok(r.status_code, "so acc+", r.text)
    r = client.post(
        "/api/v1/social/accounts/connect",
        json={"project_id": pid, "platform": "facebook"},
    )
    assert_ok(r.status_code, "so conn", r.text)
    acc_id = r.json()["id"]
    r = client.get("/api/v1/social/posts", params={"project_id": pid})
    assert_ok(r.status_code, "so posts", r.text)
    r = client.post(
        "/api/v1/social/posts",
        json={"project_id": pid, "content": "Hello world"},
    )
    assert_ok(r.status_code, "so post+", r.text)
    post_id = r.json()["id"]
    r = client.put(
        f"/api/v1/social/posts/{post_id}",
        json={"content": "Updated"},
    )
    assert_ok(r.status_code, "so put", r.text)
    r = client.post(f"/api/v1/social/posts/{post_id}/publish")
    assert_ok(r.status_code, "so pub", r.text)
    r = client.get(f"/api/v1/social/posts/{post_id}/metrics")
    assert_ok(r.status_code, "so met", r.text)
    r = client.get("/api/v1/social/analytics", params={"project_id": pid})
    assert_ok(r.status_code, "so an", r.text)
    r = client.get("/api/v1/social/calendar", params={"project_id": pid})
    assert_ok(r.status_code, "so cal", r.text)
    r = client.get("/api/v1/social/influencers", params={"project_id": pid, "niche": "x"})
    assert_ok(r.status_code, "so inf", r.text)
    r = client.post(
        "/api/v1/social/influencers?project_id=%d&platform=twitter&username=u1" % pid,
    )
    assert_ok(r.status_code, "so inf+", r.text)
    r = client.delete(f"/api/v1/social/accounts/{acc_id}")
    assert_ok(r.status_code, "so del", r.text)
    r = client.delete(f"/api/v1/social/posts/{post_id}")
    assert r.status_code == 204


def test_advertising(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/advertising/keywords", params={"project_id": pid})
    assert_ok(r.status_code, "ad kw", r.text)
    r = client.post(
        "/api/v1/advertising/keywords?project_id=%d&keyword=test+ad" % pid,
    )
    assert_ok(r.status_code, "ad kw+", r.text)
    kid = r.json()["id"]
    r = client.get("/api/v1/advertising/intelligence", params={"domain": "example.com"})
    assert_ok(r.status_code, "ad int", r.text)
    r = client.get("/api/v1/advertising/intelligence/fetch", params={"domain": "example.com"})
    assert_ok(r.status_code, "ad intf", r.text)
    r = client.get("/api/v1/advertising/competitor-ads", params={"domain": "example.com"})
    assert_ok(r.status_code, "ad ca", r.text)
    r = client.get("/api/v1/advertising/keyword-cpc", params={"keywords": "coffee,tea"})
    assert_ok(r.status_code, "ad cpc", r.text)
    r = client.get("/api/v1/advertising/ppc-research", params={"keyword": "coffee"})
    assert_ok(r.status_code, "ad ppc", r.text)
    r = client.get("/api/v1/advertising/competitors/example.com")
    assert_ok(r.status_code, "ad compath", r.text)
    r = client.post("/api/v1/advertising/ai/copy", json={"product": "X", "audience": "Y"})
    assert_ok(r.status_code, "ad copy", r.text)
    r = client.delete(f"/api/v1/advertising/keywords/{kid}")
    assert r.status_code == 204


def test_local_seo(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/local-seo/profiles", params={"project_id": pid})
    assert_ok(r.status_code, "ls pr", r.text)
    r = client.post(
        "/api/v1/local-seo/profiles",
        json={
            "project_id": pid,
            "name": "Shop",
            "address": "1 Main",
            "phone": "555",
            "website": "https://shop.com",
        },
    )
    assert_ok(r.status_code, "ls pr+", r.text)
    prof_id = r.json()["id"]
    r = client.get(f"/api/v1/local-seo/profiles/{prof_id}")
    assert_ok(r.status_code, "ls pr1", r.text)
    r = client.put(
        f"/api/v1/local-seo/profiles/{prof_id}",
        json={"name": "Shop2"},
    )
    assert_ok(r.status_code, "ls put", r.text)
    r = client.post(f"/api/v1/local-seo/profiles/{prof_id}/sync")
    assert_ok(r.status_code, "ls sync", r.text)
    r = client.get("/api/v1/local-seo/rank-history", params={"project_id": pid})
    assert_ok(r.status_code, "ls rh", r.text)
    r = client.get("/api/v1/local-seo/reviews", params={"profile_id": prof_id})
    assert_ok(r.status_code, "ls rev", r.text)
    r = client.post(
        "/api/v1/local-seo/reviews/ai-suggest",
        json={"review_text": "Great", "rating": 5, "business_name": "Shop"},
    )
    assert_ok(r.status_code, "ls ais", r.text)
    r = client.get("/api/v1/local-seo/citations", params={"project_id": pid})
    assert_ok(r.status_code, "ls cit", r.text)
    r = client.post("/api/v1/local-seo/citations/scan", json={"project_id": pid, "profile_id": prof_id})
    assert_ok(r.status_code, "ls scan", r.text)
    r = client.get(f"/api/v1/local-seo/heatmap/{prof_id}")
    assert_ok(r.status_code, "ls heat", r.text)
    r = client.delete(f"/api/v1/local-seo/profiles/{prof_id}")
    assert r.status_code == 204


def test_reporting(client: TestClient, project_id: int):
    r = client.get("/api/v1/reporting/portfolios")
    assert_ok(r.status_code, "rep p", r.text)
    r = client.post(
        "/api/v1/reporting/portfolios",
        json={"name": "P1", "urls": ["https://a.com"]},
    )
    assert_ok(r.status_code, "rep p+", r.text)
    port_id = r.json()["id"]
    r = client.get(f"/api/v1/reporting/portfolios/{port_id}")
    assert_ok(r.status_code, "rep p1", r.text)
    r = client.get(f"/api/v1/reporting/portfolios/{port_id}/metrics")
    assert_ok(r.status_code, "rep m", r.text)
    r = client.put(
        f"/api/v1/reporting/portfolios/{port_id}",
        json={"name": "P2"},
    )
    assert_ok(r.status_code, "rep put", r.text)
    r = client.get("/api/v1/reporting/templates")
    assert_ok(r.status_code, "rep t", r.text)
    r = client.post("/api/v1/reporting/templates?name=T1")
    assert_ok(r.status_code, "rep t+", r.text)
    tid = r.json()["id"]
    r = client.post(
        "/api/v1/reporting/reports/generate",
        json={"template_id": tid, "project_id": project_id, "title": "R1"},
    )
    assert_ok(r.status_code, "rep gen", r.text)
    r = client.post(
        "/api/v1/reporting/generate",
        json={"template_id": tid, "title": "R2"},
    )
    assert_ok(r.status_code, "rep gena", r.text)
    r = client.get("/api/v1/reporting/reports")
    assert_ok(r.status_code, "rep lr", r.text)
    r = client.get("/api/v1/reporting/scheduled")
    assert_ok(r.status_code, "rep sch", r.text)
    r = client.post(
        "/api/v1/reporting/scheduled?template_id=%d&frequency=daily" % tid,
    )
    assert_ok(r.status_code, "rep sch+", r.text)
    sch_id = r.json()["id"]
    r = client.delete(f"/api/v1/reporting/scheduled/{sch_id}")
    assert r.status_code == 204
    r = client.delete(f"/api/v1/reporting/portfolios/{port_id}")
    assert r.status_code == 204


def test_alerts_settings_jobs(client: TestClient, project_id: int):
    pid = project_id
    r = client.get("/api/v1/alerts/", params={"project_id": pid})
    assert_ok(r.status_code, "al list", r.text)
    r = client.post(
        "/api/v1/alerts/",
        json={
            "project_id": pid,
            "name": "A1",
            "type": "ranking_drop",
            "config": {},
            "channels": {},
        },
    )
    assert_ok(r.status_code, "al +", r.text)
    aid = r.json()["id"]
    r = client.get("/api/v1/alerts/history", params={"project_id": pid})
    assert_ok(r.status_code, "al hist", r.text)
    r = client.get(f"/api/v1/alerts/{aid}")
    assert_ok(r.status_code, "al 1", r.text)
    r = client.put(f"/api/v1/alerts/{aid}", json={"is_active": False})
    assert_ok(r.status_code, "al put", r.text)
    r = client.post(f"/api/v1/alerts/{aid}/test")
    assert_ok(r.status_code, "al test", r.text)
    r = client.delete(f"/api/v1/alerts/{aid}")
    assert r.status_code == 204

    r = client.get("/api/v1/settings/")
    assert_ok(r.status_code, "set", r.text)
    r = client.get("/api/v1/settings/audit-log")
    assert_ok(r.status_code, "set al", r.text)
    r = client.get("/api/v1/settings/export")
    assert_ok(r.status_code, "set ex", r.text)
    r = client.put("/api/v1/settings/foo?value=bar")
    assert_ok(r.status_code, "set put", r.text)
    r = client.post("/api/v1/settings/bulk", json={"a": "1"})
    assert_ok(r.status_code, "set bulk", r.text)
    r = client.delete("/api/v1/settings/foo")
    assert r.status_code == 204

    r = client.get("/api/v1/jobs/")
    assert_ok(r.status_code, "jobs", r.text)
    r = client.get("/api/v1/jobs/999999")
    assert r.status_code == 404
