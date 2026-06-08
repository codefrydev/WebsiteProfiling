"""Optional crawl audits: pagination, spell, HTML, AMP, Wayback, axe issues."""
from __future__ import annotations

import json
import re
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd
import requests

from ..config import get_bool
from .categories import _issue, _sort_issues


def _parse_page_analysis(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw or not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _content_quality_category(categories: list[dict]) -> dict | None:
    for cat in categories:
        if str(cat.get("id") or "") == "intelligence":
            return cat
    return None


def _technical_category(categories: list[dict]) -> dict | None:
    for cat in categories:
        if str(cat.get("id") or "") == "technical_seo":
            return cat
    return None


def _accessibility_category(categories: list[dict]) -> dict | None:
    for cat in categories:
        if str(cat.get("id") or "") == "html_accessibility":
            return cat
    return None


def pagination_issues(df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    if df is None or df.empty or "page_analysis" not in df.columns:
        return issues
    missing_next = 0
    orphan_prev = 0
    amp_mismatch = 0
    for _, row in df.iterrows():
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        pa = _parse_page_analysis(row.get("page_analysis"))
        pag = pa.get("pagination") if isinstance(pa.get("pagination"), dict) else {}
        rel_next = pag.get("rel_next")
        rel_prev = pag.get("rel_prev")
        if rel_next and not rel_prev:
            missing_next += 0  # rel_prev optional on first page
        if rel_prev and not rel_next:
            orphan_prev += 1
        amphtml = pag.get("amphtml")
        if amphtml and str(row.get("canonical_url") or "").strip() and amphtml != row.get("canonical_url"):
            amp_mismatch += 1
    if orphan_prev:
        issues.append(_issue(
            f"{orphan_prev} page(s) have rel=prev without rel=next (pagination chain may be broken).",
            priority="Medium",
            recommendation="Ensure paginated series use paired rel=next and rel=prev links.",
        ))
    if amp_mismatch:
        issues.append(_issue(
            f"{amp_mismatch} page(s) have amphtml link that does not match canonical.",
            priority="Medium",
            recommendation="Pair AMP and canonical URLs correctly for mobile/desktop variants.",
        ))
    return issues


def spell_check_issues(df: pd.DataFrame, *, max_pages: int = 50) -> list[dict]:
    issues: list[dict] = []
    try:
        from spellchecker import SpellChecker  # type: ignore[import-untyped]
    except ImportError:
        return issues
    spell = SpellChecker()
    checked = 0
    for _, row in df.iterrows():
        if checked >= max_pages:
            break
        status = str(row.get("status") or "")
        if not status.startswith("2"):
            continue
        excerpt = str(row.get("content_excerpt") or row.get("meta_description") or "").strip()
        if len(excerpt) < 40:
            continue
        words = re.findall(r"[a-zA-Z']{4,}", excerpt.lower())
        if not words:
            continue
        unknown = spell.unknown(words[:120])
        if len(unknown) >= 3:
            url = str(row.get("url") or "")
            sample = ", ".join(sorted(unknown)[:5])
            issues.append(_issue(
                f"Possible spelling issues ({sample}).",
                url=url,
                priority="Low",
                recommendation="Review visible copy for typos; spell check is heuristic on excerpt text.",
            ))
            checked += 1
    return issues[:20]


def html_validation_issues(df: pd.DataFrame, *, max_pages: int = 30) -> list[dict]:
    issues: list[dict] = []
    checked = 0
    for _, row in df.iterrows():
        if checked >= max_pages:
            break
        html = str(row.get("html") or "")
        if len(html) < 100:
            continue
        url = str(row.get("url") or "")
        warnings: list[str] = []
        if html.count("<title") > 1:
            warnings.append("multiple title tags")
        if re.search(r"<html[^>]*>", html, re.I) and not re.search(r"</html>", html, re.I):
            warnings.append("missing closing html tag")
        ids = re.findall(r'\bid=["\']([^"\']+)["\']', html, re.I)
        if len(ids) != len(set(ids)):
            warnings.append("duplicate id attributes")
        if warnings:
            issues.append(_issue(
                f"HTML structure warnings: {', '.join(warnings)}.",
                url=url,
                priority="Low",
                recommendation="Fix markup validation issues that may affect parsing or accessibility.",
            ))
            checked += 1
    return issues


def amp_audit_issues(df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    if df is None or df.empty:
        return issues
    amp_pages = 0
    missing_canonical = 0
    for _, row in df.iterrows():
        url = str(row.get("url") or "")
        pa = _parse_page_analysis(row.get("page_analysis"))
        pag = pa.get("pagination") if isinstance(pa.get("pagination"), dict) else {}
        amphtml = pag.get("amphtml")
        is_amp = "/amp" in urlparse(url).path.lower() or bool(re.search(r"\bamp\b", str(row.get("content_type") or ""), re.I))
        if amphtml or is_amp:
            amp_pages += 1
            canon = str(row.get("canonical_url") or "").strip()
            if not canon:
                missing_canonical += 1
                issues.append(_issue(
                    "AMP or amphtml variant missing canonical URL.",
                    url=url,
                    priority="Medium",
                    recommendation="Add canonical link pointing to the preferred non-AMP URL.",
                ))
    if amp_pages and not issues:
        return []
    return issues[:25]


def wayback_issues(df: pd.DataFrame, *, max_lookups: int = 15) -> list[dict]:
    issues: list[dict] = []
    if df is None or df.empty:
        return issues
    looked = 0
    for _, row in df.iterrows():
        if looked >= max_lookups:
            break
        status = str(row.get("status") or "")
        if not status.startswith("404"):
            continue
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        try:
            resp = requests.get(
                "https://archive.org/wayback/available",
                params={"url": url},
                timeout=8,
            )
            data = resp.json()
            snap = (data.get("archived_snapshots") or {}).get("closest") or {}
            if snap.get("available"):
                ts = snap.get("timestamp") or "unknown"
                issues.append(_issue(
                    f"404 URL has Wayback snapshot (Estimated, captured {ts}).",
                    url=url,
                    priority="Low",
                    recommendation="Review whether redirect or content restoration is appropriate.",
                ))
                looked += 1
        except Exception:
            continue
    return issues


def axe_issues_from_df(df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    if df is None or df.empty or "page_analysis" not in df.columns:
        return issues
    for _, row in df.iterrows():
        pa = _parse_page_analysis(row.get("page_analysis"))
        axe = pa.get("axe_violations")
        if not isinstance(axe, list) or not axe:
            continue
        url = str(row.get("url") or "")
        for v in axe[:5]:
            if not isinstance(v, dict):
                continue
            msg = str(v.get("description") or v.get("id") or "axe violation")
            issues.append(_issue(
                f"axe: {msg}",
                url=url,
                priority="Medium",
                recommendation=str(v.get("help") or "Fix accessibility violation reported by axe-core."),
            ))
    return issues[:40]


def apply_optional_audits(
    categories: list[dict],
    df: pd.DataFrame,
    config: Optional[dict[str, str]],
) -> dict[str, Any]:
    """Merge optional audit issues into categories; return sidecar payload keys."""
    cfg = config or {}
    extras: dict[str, Any] = {}
    tech = _technical_category(categories)
    content = _content_quality_category(categories)
    a11y = _accessibility_category(categories)

    pag = pagination_issues(df)
    if pag and tech is not None:
        tech.setdefault("issues", []).extend(pag)
        tech["issues"] = _sort_issues(tech["issues"])

    if get_bool(cfg, "enable_spell_check", False) and content is not None:
        spell = spell_check_issues(df)
        if spell:
            content.setdefault("issues", []).extend(spell)
            content["issues"] = _sort_issues(content["issues"])
            extras["spell_check_pages"] = len(spell)

    if get_bool(cfg, "enable_html_validation", False) and tech is not None:
        html_issues = html_validation_issues(df)
        if html_issues:
            tech.setdefault("issues", []).extend(html_issues)
            tech["issues"] = _sort_issues(tech["issues"])

    if get_bool(cfg, "enable_amp_audit", False) and tech is not None:
        amp = amp_audit_issues(df)
        if amp:
            tech.setdefault("issues", []).extend(amp)
            tech["issues"] = _sort_issues(tech["issues"])

    if get_bool(cfg, "enable_wayback_lookup", False) and tech is not None:
        wb = wayback_issues(df)
        if wb:
            tech.setdefault("issues", []).extend(wb)
            tech["issues"] = _sort_issues(tech["issues"])
            extras["wayback_404_checked"] = min(15, len(wb))

    if get_bool(cfg, "enable_axe", False) and a11y is not None:
        axe = axe_issues_from_df(df)
        if axe:
            a11y.setdefault("issues", []).extend(axe)
            a11y["issues"] = _sort_issues(a11y["issues"])
            extras["axe_violation_count"] = len(axe)

    return extras
