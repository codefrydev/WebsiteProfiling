"""Aggregate business contact signals from crawl, site files, and RDAP."""
from __future__ import annotations

import json
import re
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd

from ..config import get_bool
from .site_files import fetch_rdap_org_name

_CONTACT_PAGE_RE = re.compile(r"/(contact|about|support)(/|$)", re.I)
_ORG_SCHEMA_TYPES = frozenset({"organization", "localbusiness", "corporation"})
_LIST_LIMIT = 50


def _parse_page_analysis(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw or (isinstance(raw, float) and pd.isna(raw)):
        return {}
    s = str(raw).strip()
    if not s or s == "{}":
        return {}
    try:
        parsed = json.loads(s)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _merge_entry(
    bucket: dict[str, dict[str, Any]],
    value: str,
    *,
    source: str,
    url: str = "",
) -> None:
    val = value.strip()
    if not val:
        return
    key = val.lower()
    if key not in bucket:
        bucket[key] = {"value": val, "sources": [], "urls": []}
    entry = bucket[key]
    if source not in entry["sources"]:
        entry["sources"].append(source)
    if url and url not in entry["urls"]:
        entry["urls"].append(url)


def _signals_from_page(pa: dict[str, Any]) -> dict[str, list[str]]:
    signals = pa.get("contact_signals")
    if not isinstance(signals, dict):
        return {}
    out: dict[str, list[str]] = {}
    for key in ("emails", "phones", "addresses", "organization_names"):
        raw = signals.get(key)
        if isinstance(raw, list):
            out[key] = [str(x).strip() for x in raw if str(x).strip()]
    return out


def _has_org_schema(pa: dict[str, Any]) -> bool:
    types = pa.get("json_ld_types") or []
    if isinstance(types, str):
        types = [types]
    if not isinstance(types, list):
        return False
    return any(str(t).strip().lower() in _ORG_SCHEMA_TYPES for t in types)


def _apex_from_start_url(start_url: str) -> str:
    parsed = urlparse((start_url or "").strip())
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def build_contact_intelligence(
    df: pd.DataFrame,
    site_level: dict[str, Any],
    start_url: str,
    config: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build sourced contact intelligence from crawl page_analysis and site files."""
    emails: dict[str, dict[str, Any]] = {}
    phones: dict[str, dict[str, Any]] = {}
    addresses: dict[str, dict[str, Any]] = {}
    org_names: dict[str, dict[str, Any]] = {}

    success_df = (
        df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
        if "status" in df.columns and not df.empty
        else pd.DataFrame()
    )
    page_scores: list[tuple[int, str]] = []
    has_org_on_home = False

    for _, row in success_df.iterrows():
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        pa = _parse_page_analysis(row.get("page_analysis"))
        signals = _signals_from_page(pa)
        org_schema = _has_org_schema(pa)
        path = urlparse(url).path or "/"
        if path in ("/", "") and org_schema:
            has_org_on_home = True

        score = sum(len(signals.get(k) or []) for k in signals)
        if score:
            page_scores.append((score, url))

        for email in signals.get("emails") or []:
            _merge_entry(emails, email, source="json_ld" if org_schema else "crawl", url=url)
        for phone in signals.get("phones") or []:
            _merge_entry(phones, phone, source="tel_link", url=url)
        for addr in signals.get("addresses") or []:
            _merge_entry(addresses, addr, source="json_ld", url=url)
        for org in signals.get("organization_names") or []:
            _merge_entry(org_names, org, source="json_ld", url=url)

    for contact in site_level.get("security_txt_contact") or []:
        if not isinstance(contact, str):
            continue
        c = contact.strip()
        if c.lower().startswith("mailto:"):
            _merge_entry(emails, c[7:].split("?")[0], source="security_txt", url="")
        elif c.lower().startswith("tel:"):
            _merge_entry(phones, c[4:].split("?")[0], source="security_txt", url="")
        elif "@" in c:
            _merge_entry(emails, c, source="security_txt", url="")

    if get_bool(config or {}, "enable_rdap_org_lookup", True):
        apex = _apex_from_start_url(start_url)
        if apex:
            org = fetch_rdap_org_name(apex)
            if org:
                _merge_entry(org_names, org, source="whois_org", url="")

    primary_contact_page: Optional[str] = None
    if page_scores:
        page_scores.sort(key=lambda x: (-x[0], x[1]))
        for _, candidate in page_scores:
            if _CONTACT_PAGE_RE.search(urlparse(candidate).path or ""):
                primary_contact_page = candidate
                break
        if not primary_contact_page:
            primary_contact_page = page_scores[0][1]

    consistency_notes: list[str] = []
    if len(emails) > 3:
        consistency_notes.append(f"{len(emails)} distinct email addresses found across the site.")
    if len(org_names) > 1:
        consistency_notes.append(f"{len(org_names)} distinct organization names found in structured data.")
    if not has_org_on_home:
        consistency_notes.append("No Organization (or LocalBusiness) schema detected on the homepage.")

    def _list_items(bucket: dict[str, dict[str, Any]], limit: int = _LIST_LIMIT) -> list[dict[str, Any]]:
        return list(bucket.values())[:limit]

    return {
        "emails": _list_items(emails),
        "phones": _list_items(phones),
        "addresses": _list_items(addresses),
        "organization_names": _list_items(org_names),
        "primary_contact_page": primary_contact_page,
        "consistency_notes": consistency_notes,
    }
