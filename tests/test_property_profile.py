"""Tests for property profile: site files, subdomains, contact intelligence."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd

from website_profiling.analysis.page import (
    _append_contact,
    _collect_json_ld_contacts,
    _collect_json_ld_types,
    _format_postal_address,
    _normalize_type_name,
    analyze_html,
)
from website_profiling.reporting.builder import _fetch_site_level
from website_profiling.reporting.categories import category_technical_seo, merge_subdomain_issues
from website_profiling.reporting.contact_intelligence import (
    _apex_from_start_url,
    _has_org_schema,
    _merge_entry,
    _parse_page_analysis,
    _signals_from_page,
    build_contact_intelligence,
)
from website_profiling.reporting.site_files import (
    fetch_ads_txt,
    fetch_rdap_org_name,
    fetch_security_txt,
    merge_site_file_fields,
    parse_ads_txt,
    parse_security_txt,
)
from website_profiling.reporting.subdomains import (
    _crawl_hosts,
    _fetch_crtsh_hosts,
    _gsc_hosts,
    _host_in_scope,
    build_subdomain_inventory,
)


def test_parse_ads_txt_valid_lines():
    text = "example.com, pub-123, DIRECT\n# comment\n\nbad-line"
    out = parse_ads_txt(text)
    assert out["ads_txt_present"] is True
    assert out["ads_txt_line_count"] == 1
    assert out["ads_txt_valid"] is False
    assert "invalid_line:4" in out["ads_txt_issues"]


def test_parse_ads_txt_empty():
    out = parse_ads_txt("")
    assert out["ads_txt_present"] is False
    assert out["ads_txt_valid"] is False


def test_parse_security_txt_contact_and_expires():
    text = "Contact: mailto:sec@example.com\nExpires: 2030-01-01T00:00:00Z\n"
    out = parse_security_txt(text)
    assert out["security_txt_present"] is True
    assert out["security_txt_valid"] is True
    assert out["security_txt_contact"] == ["mailto:sec@example.com"]
    assert out["security_txt_expires"] == "2030-01-01T00:00:00Z"


def test_json_ld_contact_helper_edge_cases():
    assert _normalize_type_name(["Organization", "Person"]) == "Organization"
    assert _normalize_type_name(42) == ""

    types: set[str] = set()
    _collect_json_ld_types(
        {"@type": "WebPage", "mainEntity": {"@type": "Article", "about": [{"@type": "Thing"}]}},
        types,
    )
    assert "WebPage" in types
    assert "Article" in types
    assert "Thing" in types

    assert _format_postal_address(" 123 Main St ") == "123 Main St"
    assert _format_postal_address(99) == ""
    assert (
        _format_postal_address(
            {
                "streetAddress": "1 Main",
                "addressLocality": "Town",
                "addressRegion": "CA",
                "postalCode": "90210",
                "addressCountry": "US",
            }
        )
        == "1 Main, Town, CA, 90210, US"
    )

    signals: dict[str, list[str]] = {}
    _append_contact(signals, "emails", 123)
    _append_contact(signals, "emails", "   ")
    _append_contact(signals, "emails", "a@x.com")
    _append_contact(signals, "emails", "a@x.com")
    assert signals["emails"] == ["a@x.com"]

    for i in range(12):
        _append_contact(signals, "phones", f"+1{i:03d}")
    assert len(signals["phones"]) == 10

    contact_payload = {
        "@type": ["LocalBusiness", "Organization"],
        "name": "Shop",
        "email": "shop@example.com",
        "telephone": "+1-555-0100",
        "address": "123 Simple St",
        "@graph": [
            {
                "@type": "NewsMediaOrganization",
                "name": "Press",
                "email": "press@example.com",
                "telephone": "+1-555-0200",
            },
            {
                "subsidiary": {
                    "@type": "Organization",
                    "name": "Nested Org",
                    "email": "nested@example.com",
                    "address": {"streetAddress": "9 Side", "addressLocality": "Alley"},
                }
            },
        ],
    }
    org_signals: dict[str, list[str]] = {}
    _collect_json_ld_contacts(contact_payload, org_signals)
    assert "shop@example.com" in org_signals["emails"]
    assert "press@example.com" in org_signals["emails"]
    assert "nested@example.com" in org_signals["emails"]
    assert "123 Simple St" in org_signals["addresses"]
    assert "9 Side, Alley" in org_signals["addresses"]

    list_signals: dict[str, list[str]] = {}
    _collect_json_ld_contacts(
        [{"@type": "Organization", "name": "List Org", "email": "list@example.com"}],
        list_signals,
    )
    assert "list@example.com" in list_signals["emails"]


def test_analyze_html_contact_and_json_ld_types():
    html = """
    <html><head>
    <script type="application/ld+json">
    {"@type":"Organization","name":"Acme Inc","email":"hello@acme.com","telephone":"+1-555-0100"}
    </script>
    </head><body>
    <a href="mailto:sales@acme.com">Email</a>
    <a href="tel:+15550199">Call</a>
    </body></html>
    """
    out = analyze_html(html, "https://acme.com/", "https://acme.com/")
    assert "Organization" in out.get("json_ld_types", [])
    signals = out.get("contact_signals") or {}
    assert "hello@acme.com" in signals.get("emails", [])
    assert "sales@acme.com" in signals.get("emails", [])
    assert any("+1555" in p for p in signals.get("phones", []))


def test_build_contact_intelligence_dedup_and_security_txt():
    pa = json.dumps(
        {
            "json_ld_types": ["Organization"],
            "contact_signals": {
                "emails": ["Hello@Example.com", "other@example.com"],
                "phones": [],
                "addresses": [],
                "organization_names": ["Example Co"],
            },
        }
    )
    df = pd.DataFrame([{"url": "https://example.com/contact", "status": "200", "page_analysis": pa}])
    site_level = {"security_txt_contact": ["mailto:sec@example.com"]}
    with patch("website_profiling.reporting.contact_intelligence.fetch_rdap_org_name", return_value=None):
        out = build_contact_intelligence(df, site_level, "https://example.com/", {"enable_rdap_org_lookup": "false"})
    emails = {e["value"].lower() for e in out["emails"]}
    assert "hello@example.com" in emails
    assert "other@example.com" in emails
    assert "sec@example.com" in emails
    assert out["primary_contact_page"] == "https://example.com/contact"


def test_build_subdomain_inventory_crawl_and_gsc():
    df = pd.DataFrame(
        [
            {"url": "https://www.example.com/", "status": "200"},
            {"url": "https://www.example.com/about", "status": "200"},
        ]
    )
    indexation = {
        "lists": {"gsc_not_crawled": ["https://blog.example.com/post"]},
        "url_join": {},
    }
    with patch("website_profiling.reporting.subdomains._fetch_crtsh_hosts", return_value=(set(), None)):
        out = build_subdomain_inventory(df, indexation, "https://www.example.com/", {"subdomain_ct_lookup": "false"})
    hosts = {h["host"]: h for h in out["hosts"]}
    assert "www.example.com" in hosts
    assert hosts["www.example.com"]["in_crawl"] is True
    assert "blog.example.com" in out["gsc_hosts_not_crawled"]


def test_merge_subdomain_issues_adds_medium_issue():
    categories = [{"id": "technical_seo", "issues": [], "recommendations": []}]
    merge_subdomain_issues(categories, {"gsc_hosts_not_crawled": ["blog.example.com"]})
    assert len(categories[0]["issues"]) == 1
    assert categories[0]["issues"][0]["priority"] == "Medium"


def test_category_technical_seo_missing_ads_and_security_txt():
    df = pd.DataFrame([{"url": "https://example.com", "status": "200"}])
    site_level = {
        "robots_present": True,
        "sitemap_present": True,
        "sitemap_valid": True,
        "ads_txt_present": False,
        "security_txt_present": False,
    }
    cat = category_technical_seo(df, site_level)
    msgs = " ".join(i["message"] for i in cat["issues"])
    assert "ads.txt" in msgs
    assert "security.txt" in msgs


def test_parse_ads_txt_no_valid_sellers():
    out = parse_ads_txt("# only comments\ninvalid-line\n")
    assert out["ads_txt_present"] is True
    assert out["ads_txt_valid"] is False
    assert "no_sellers" in out["ads_txt_issues"]


def test_parse_security_txt_skips_blank_and_malformed_lines():
    text = "\n# comment\nno-colon-line\nContact:\nContact: mailto:ok@example.com\n"
    out = parse_security_txt(text)
    assert out["security_txt_contact"] == ["mailto:ok@example.com"]


def test_fetch_security_txt_falls_back_and_handles_errors():
    class FakeResp:
        def __init__(self, status_code, text):
            self.status_code = status_code
            self.text = text

    session = MagicMock()
    session.get.side_effect = [
        FakeResp(404, ""),
        RuntimeError("timeout"),
    ]
    assert fetch_security_txt(session, "https://example.com")["security_txt_present"] is False


def test_fetch_ads_and_security_txt_helpers():
    class FakeResp:
        def __init__(self, status_code, text):
            self.status_code = status_code
            self.text = text

    session = MagicMock()
    session.get.side_effect = [
        FakeResp(404, ""),
        FakeResp(200, "Contact: mailto:sec@example.com\n"),
    ]
    assert fetch_ads_txt(session, "https://example.com")["ads_txt_present"] is False
    sec = fetch_security_txt(session, "https://example.com")
    assert sec["security_txt_present"] is True

    session.get.side_effect = RuntimeError("network")
    assert fetch_ads_txt(session, "https://example.com")["ads_txt_present"] is False


def test_fetch_rdap_org_name_paths(monkeypatch):
    class FakeResp:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: FakeResp(
            200,
            {
                "entities": [
                    "bad",
                    {
                        "roles": ["administrative"],
                        "vcardArray": ["vcard", ["org", {}, "text", "Ignored"]],
                    },
                    {"roles": ["registrant"], "vcardArray": ["vcard"]},
                    {"roles": ["registrant"], "vcardArray": ["vcard", ["fn", {}, "text", ""]]},
                    {"roles": ["registrant"], "vcardArray": ["vcard", ["bad"]]},
                    {
                        "roles": ["registrant"],
                        "vcardArray": ["vcard", ["org", {}, "text", "Org Name Inc"]],
                    },
                ]
            },
        ),
    )
    assert fetch_rdap_org_name("www.example.com") == "Org Name Inc"

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: FakeResp(
            200,
            {
                "entities": [
                    {
                        "roles": ["registrant"],
                        "vcardArray": ["vcard", ["fn", {}, "text", "Acme Holdings"]],
                    }
                ]
            },
        ),
    )
    assert fetch_rdap_org_name("example.com") == "Acme Holdings"
    assert fetch_rdap_org_name("") is None
    assert fetch_rdap_org_name("localhost") is None

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: FakeResp(404, {}),
    )
    assert fetch_rdap_org_name("example.com") is None

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: FakeResp(200, {"entities": "bad"}),
    )
    assert fetch_rdap_org_name("example.com") is None

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("rdap down")),
    )
    assert fetch_rdap_org_name("example.com") is None

    monkeypatch.setattr(
        "website_profiling.reporting.site_files.requests.get",
        lambda *a, **k: FakeResp(200, {"entities": [{"roles": ["admin"], "vcardArray": ["vcard", ["fn", {}, "text", "X"]]}]}),
    )
    assert fetch_rdap_org_name("example.com") is None


def test_merge_site_file_fields():
    out: dict = {}
    merge_site_file_fields(out, {"ads_txt_present": True, "security_txt_present": False})
    assert out["ads_txt_present"] is True


def test_contact_intelligence_helpers_and_branches():
    assert _parse_page_analysis({"emails": ["a@x.com"]})["emails"] == ["a@x.com"]
    assert _parse_page_analysis(float("nan")) == {}
    assert _parse_page_analysis("{}") == {}
    assert _parse_page_analysis("{bad") == {}

    bucket: dict = {}
    _merge_entry(bucket, "   ", source="x")
    _merge_entry(bucket, "A@X.com", source="json_ld", url="https://example.com")
    _merge_entry(bucket, "a@x.com", source="tel_link", url="https://example.com/contact")
    assert bucket["a@x.com"]["sources"] == ["json_ld", "tel_link"]

    assert _signals_from_page({"contact_signals": "bad"}) == {}
    assert _signals_from_page({"contact_signals": {"emails": [" a@x.com ", ""]}})["emails"] == ["a@x.com"]
    assert _has_org_schema({"json_ld_types": "Organization"}) is True
    assert _has_org_schema({"json_ld_types": 42}) is False
    assert _apex_from_start_url("https://www.example.com/") == "example.com"


def test_build_contact_intelligence_rich_paths():
    pa_home = json.dumps(
        {
            "json_ld_types": ["Organization"],
            "contact_signals": {
                "emails": ["home@example.com"],
                "phones": ["+1-555-0001"],
                "addresses": ["1 Main"],
                "organization_names": ["Example Co"],
            },
        }
    )
    pa_about = json.dumps(
        {
            "contact_signals": {
                "emails": ["about@example.com", "extra1@example.com", "extra2@example.com", "extra3@example.com"],
                "organization_names": ["Other Co"],
            }
        }
    )
    df = pd.DataFrame(
        [
            {"url": "https://www.example.com/", "status": "200", "page_analysis": pa_home},
            {"url": "https://www.example.com/about", "status": "200", "page_analysis": pa_about},
            {"url": "", "status": "200", "page_analysis": "{}"},
        ]
    )
    site_level = {
        "security_txt_contact": [
            "mailto:sec@example.com",
            "tel:+15550100",
            "security@example.com",
            42,
        ]
    }
    with patch("website_profiling.reporting.contact_intelligence.fetch_rdap_org_name", return_value="RDAP Org"):
        out = build_contact_intelligence(df, site_level, "https://www.example.com/", {"enable_rdap_org_lookup": "true"})
    assert out["primary_contact_page"] == "https://www.example.com/about"
    assert any(n["value"] == "RDAP Org" for n in out["organization_names"])
    assert any("distinct email" in n for n in out["consistency_notes"])
    assert any("organization names" in n for n in out["consistency_notes"])
    assert not any("homepage" in n.lower() for n in out["consistency_notes"])


def test_build_contact_intelligence_without_home_org_schema():
    pa = json.dumps({"contact_signals": {"emails": ["only@example.com"]}})
    df = pd.DataFrame([{"url": "https://example.com/page", "status": "200", "page_analysis": pa}])
    with patch("website_profiling.reporting.contact_intelligence.fetch_rdap_org_name", return_value=None):
        out = build_contact_intelligence(df, {}, "https://example.com/", {"enable_rdap_org_lookup": "false"})
    assert out["primary_contact_page"] == "https://example.com/page"
    assert any("homepage" in n.lower() for n in out["consistency_notes"])


def test_subdomain_inventory_helpers_and_ct(monkeypatch):
    assert _host_in_scope("", "example.com") is False
    assert _fetch_crtsh_hosts("")[0] == set()
    assert _crawl_hosts(pd.DataFrame()) == {}
    assert _gsc_hosts(None) == ({}, [])
    counts, not_crawled = _gsc_hosts(
        {
            "lists": {"gsc_not_crawled": ["https://blog.example.com/post"]},
            "url_join": {"gsc_only": [{"url": "https://shop.example.com/p"}]},
        }
    )
    assert counts["blog.example.com"] == 1
    assert counts["shop.example.com"] == 1
    assert "blog.example.com" in not_crawled

    class FakeResp:
        status_code = 200

        @staticmethod
        def json():
            return [{"name_value": "api.example.com\n*.example.com"}]

    monkeypatch.setattr("website_profiling.reporting.subdomains.requests.get", lambda *a, **k: FakeResp())
    hosts, err = _fetch_crtsh_hosts("example.com")
    assert "api.example.com" in hosts
    assert err is None

    disabled = build_subdomain_inventory(pd.DataFrame(), None, "https://www.example.com/", {"enable_subdomain_discovery": "false"})
    assert disabled["disabled"] is True

    df = pd.DataFrame([{"url": "https://www.example.com/", "status": "200"}])
    indexation = {"lists": {"gsc_not_crawled": ["https://blog.example.com/post"]}, "url_join": {}}
    with patch("website_profiling.reporting.subdomains._fetch_crtsh_hosts", return_value=({"cdn.example.com"}, None)):
        out = build_subdomain_inventory(df, indexation, "https://www.example.com/", {"subdomain_ct_lookup": "true"})
    sources = {h["host"]: h["sources"] for h in out["hosts"]}
    assert "crtsh" in sources["cdn.example.com"]

    with patch("website_profiling.reporting.subdomains._fetch_crtsh_hosts", return_value=(set(), "crtsh: timeout")):
        err_out = build_subdomain_inventory(df, indexation, "https://www.example.com/", {})
    assert err_out["crtsh_error"] == "crtsh: timeout"

    class BadStatus:
        status_code = 503

    monkeypatch.setattr("website_profiling.reporting.subdomains.requests.get", lambda *a, **k: BadStatus())
    hosts, err = _fetch_crtsh_hosts("example.com")
    assert hosts == set()
    assert "HTTP 503" in (err or "")

    class BadJson:
        status_code = 200

        @staticmethod
        def json():
            return {"not": "a list"}

    monkeypatch.setattr("website_profiling.reporting.subdomains.requests.get", lambda *a, **k: BadJson())
    hosts, err = _fetch_crtsh_hosts("example.com")
    assert "unexpected response" in (err or "")

    class RowJson:
        status_code = 200

        @staticmethod
        def json():
            return ["bad", {"name_value": "ok.example.com"}]

    monkeypatch.setattr("website_profiling.reporting.subdomains.requests.get", lambda *a, **k: RowJson())
    hosts, _ = _fetch_crtsh_hosts("example.com")
    assert "ok.example.com" in hosts

    monkeypatch.setattr(
        "website_profiling.reporting.subdomains.requests.get",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crtsh down")),
    )
    hosts, err = _fetch_crtsh_hosts("example.com")
    assert "crtsh down" in (err or "")

    counts, _ = _gsc_hosts(
        {
            "lists": {},
            "url_join": {
                "gsc_only": [
                    {"page": "https://shop.example.com/item"},
                    "https://plain.example.com/x",
                    "",
                ]
            },
        }
    )
    assert counts["shop.example.com"] == 1
    assert counts["plain.example.com"] == 1


def test_merge_subdomain_issues_edge_cases():
    categories = [{"id": "technical_seo", "issues": [], "recommendations": []}]
    merge_subdomain_issues(categories, {"disabled": True})
    merge_subdomain_issues(categories, {"gsc_hosts_not_crawled": []})
    assert categories[0]["issues"] == []

    merge_subdomain_issues(
        categories,
        {"gsc_hosts_not_crawled": [f"host{i}.example.com" for i in range(7)]},
    )
    assert len(categories[0]["issues"]) == 1
    assert "(+2 more)" in categories[0]["issues"][0]["message"]


def test_fetch_site_level_includes_ads_and_security(monkeypatch):
    class FakeResp:
        def __init__(self, status_code, text):
            self.status_code = status_code
            self.text = text

    def fake_get(url, timeout=8):
        if url.endswith("/ads.txt"):
            return FakeResp(200, "example.com, pub-1, DIRECT")
        if url.endswith("/.well-known/security.txt"):
            return FakeResp(200, "Contact: mailto:sec@example.com")
        if url.endswith("/robots.txt"):
            return FakeResp(200, "User-agent: *\n")
        if url.endswith("/sitemap.xml"):
            return FakeResp(200, '<?xml version="1.0"?><urlset></urlset>')
        return FakeResp(404, "")

    session = MagicMock()
    session.get.side_effect = fake_get
    monkeypatch.setattr("website_profiling.reporting.site_level.requests.Session", lambda: session)
    out = _fetch_site_level("https://example.com/", timeout=1)
    assert out["ads_txt_present"] is True
    assert out["security_txt_present"] is True
