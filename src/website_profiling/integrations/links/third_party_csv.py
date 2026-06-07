"""Parse Moz / Majestic referring-domain CSV exports (Estimated overlay)."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse


def _normalize_domain(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if "://" in raw:
        try:
            return (urlparse(raw).hostname or "").lower()
        except Exception:
            return raw
    return raw.lstrip(".")


def _pick_column(fieldnames: list[str] | None, *candidates: str) -> str | None:
    if not fieldnames:
        return None
    lookup = {f.lower().strip(): f for f in fieldnames if f}
    for name in candidates:
        key = name.lower()
        if key in lookup:
            return lookup[key]
    return None


def parse_third_party_referring_domains(
    provider: str,
    csv_text: str,
) -> list[dict[str, Any]]:
    """Return [{domain, authority?, backlinks?}] from Moz or Majestic CSV."""
    if not (csv_text or "").strip():
        return []

    provider_key = (provider or "").strip().lower()
    reader = csv.DictReader(io.StringIO(csv_text))
    fields = reader.fieldnames
    if provider_key == "moz":
        domain_col = _pick_column(
            fields,
            "root domain",
            "domain",
            "linking domain",
            "site",
        )
        metric_col = _pick_column(fields, "domain authority", "da", "authority")
        links_col = _pick_column(fields, "external links", "linking pages", "links")
    else:
        domain_col = _pick_column(
            fields,
            "referring domain",
            "referring domains",
            "domain",
            "site",
            "root domain",
        )
        metric_col = _pick_column(fields, "trust flow", "tf", "domain authority", "da")
        links_col = _pick_column(fields, "backlinks", "external backlinks", "links")

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in reader:
        if not domain_col:
            break
        domain = _normalize_domain(str(row.get(domain_col) or ""))
        if not domain or domain in seen:
            continue
        seen.add(domain)
        entry: dict[str, Any] = {"domain": domain}
        if metric_col:
            raw_metric = str(row.get(metric_col) or "").strip()
            if raw_metric:
                try:
                    entry["authority"] = float(raw_metric)
                except ValueError:
                    entry["authority"] = raw_metric
        if links_col:
            raw_links = str(row.get(links_col) or "").strip().replace(",", "")
            if raw_links:
                try:
                    entry["backlinks"] = int(float(raw_links))
                except ValueError:
                    entry["backlinks"] = raw_links
        rows.append(entry)
    return rows


def build_third_party_overlay(
    provider: str,
    csv_text: str,
    our_domains: list[str] | set[str] | None = None,
) -> dict[str, Any]:
    """Compare third-party export against GSC Links referring-domain sample."""
    provider_key = (provider or "").strip().lower()
    if provider_key not in ("moz", "majestic"):
        provider_key = "moz"

    parsed = parse_third_party_referring_domains(provider_key, csv_text)
    our_set = {_normalize_domain(d) for d in (our_domains or []) if _normalize_domain(d)}
    third_set = {row["domain"] for row in parsed if row.get("domain")}
    not_in_gsc = sorted(third_set - our_set)
    not_in_third = sorted(our_set - third_set) if our_set else []

    provenance = (
        "Moz Link Explorer export"
        if provider_key == "moz"
        else "Majestic export"
    )
    return {
        "provider": provider_key,
        "provenance": provenance,
        "source": "third_party_csv",
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "referring_domain_count": len(parsed),
        "top_domains": parsed[:100],
        "domains_not_in_gsc_sample": not_in_gsc[:100],
        "domains_not_in_gsc_count": len(not_in_gsc),
        "gsc_domains_not_in_third_party_sample": not_in_third[:50],
        "gsc_domains_not_in_third_party_count": len(not_in_third),
    }
