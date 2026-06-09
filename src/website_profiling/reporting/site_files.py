"""Parse and fetch root site files: ads.txt, security.txt, RDAP org lookup."""
from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlparse

import requests

_ADS_LINE_RE = re.compile(
    r"^([a-z0-9.\-*]+)\s*,\s*([^,\s]+)\s*,\s*(DIRECT|RESELLER|BUYER)\s*$",
    re.IGNORECASE,
)


def parse_ads_txt(text: str) -> dict[str, Any]:
    """Parse ads.txt content. Returns present flags and validation metadata."""
    out: dict[str, Any] = {
        "ads_txt_present": False,
        "ads_txt_valid": False,
        "ads_txt_line_count": 0,
        "ads_txt_issues": [],
    }
    if not text or not text.strip():
        return out
    out["ads_txt_present"] = True
    valid_lines = 0
    issues: list[str] = []
    for i, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if _ADS_LINE_RE.match(line):
            valid_lines += 1
        else:
            issues.append(f"invalid_line:{i}")
    out["ads_txt_line_count"] = valid_lines
    out["ads_txt_valid"] = valid_lines > 0 and not issues
    if valid_lines == 0 and out["ads_txt_present"]:
        issues.append("no_sellers")
    out["ads_txt_issues"] = issues
    return out


def parse_security_txt(text: str) -> dict[str, Any]:
    """Parse security.txt (RFC 9116)."""
    out: dict[str, Any] = {
        "security_txt_present": False,
        "security_txt_valid": False,
        "security_txt_contact": [],
        "security_txt_expires": None,
    }
    if not text or not text.strip():
        return out
    out["security_txt_present"] = True
    contacts: list[str] = []
    expires: Optional[str] = None
    recognized = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if not value:
            continue
        if key == "contact":
            recognized += 1
            contacts.append(value)
        elif key == "expires":
            recognized += 1
            expires = value
    out["security_txt_contact"] = contacts
    out["security_txt_expires"] = expires
    out["security_txt_valid"] = recognized > 0
    return out


def fetch_ads_txt(session: requests.Session, origin: str, timeout: int = 8) -> dict[str, Any]:
    """Fetch and parse ads.txt from site origin."""
    defaults = parse_ads_txt("")
    try:
        r = session.get(f"{origin}/ads.txt", timeout=timeout)
        if r.status_code == 200 and r.text:
            return parse_ads_txt(r.text)
    except Exception:
        pass
    return defaults


def fetch_security_txt(session: requests.Session, origin: str, timeout: int = 8) -> dict[str, Any]:
    """Fetch security.txt from .well-known then root."""
    defaults = parse_security_txt("")
    paths = ("/.well-known/security.txt", "/security.txt")
    for path in paths:
        try:
            r = session.get(f"{origin}{path}", timeout=timeout)
            if r.status_code == 200 and r.text:
                return parse_security_txt(r.text)
        except Exception:
            continue
    return defaults


def fetch_rdap_org_name(domain: str, timeout: float = 8.0) -> Optional[str]:
    """Best-effort RDAP lookup for registrant organization name."""
    apex = (domain or "").strip().lower()
    if apex.startswith("www."):
        apex = apex[4:]
    if not apex or "." not in apex:
        return None
    try:
        r = requests.get(
            f"https://rdap.org/domain/{apex}",
            timeout=timeout,
            headers={"Accept": "application/rdap+json"},
        )
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception:
        return None
    entities = data.get("entities") if isinstance(data, dict) else None
    if not isinstance(entities, list):
        return None
    for ent in entities:
        if not isinstance(ent, dict):
            continue
        roles = ent.get("roles") or []
        if isinstance(roles, list) and "registrant" not in [str(x).lower() for x in roles]:
            continue
        vcard = ent.get("vcardArray")
        if not isinstance(vcard, list) or len(vcard) < 2:
            continue
        for row in vcard[1:]:
            if not isinstance(row, list) or len(row) < 4:
                continue
            if str(row[0]).lower() == "fn" or str(row[0]).lower() == "org":
                val = row[3]
                if isinstance(val, str) and val.strip():
                    return val.strip()
    return None


def merge_site_file_fields(out: dict[str, Any], fields: dict[str, Any]) -> None:
    """Merge parse/fetch result dict into site_level out."""
    for key, val in fields.items():
        out[key] = val
