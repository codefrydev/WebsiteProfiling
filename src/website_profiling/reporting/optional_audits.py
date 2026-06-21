"""Optional crawl audits: pagination, spell, HTML, AMP, Wayback, axe issues."""
from __future__ import annotations

import json
import re
import sys
import threading
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd
import requests

from ..config import get_bool
from ..progress import emit_progress
from .categories import _issue, _sort_issues

_WAYBACK_CACHE: dict[str, bool] = {}
_WAYBACK_LOCK: threading.Lock = threading.Lock()


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


def _spell_text_parts(row: pd.Series) -> str:
    parts = [
        str(row.get("title") or ""),
        str(row.get("h1") or ""),
        str(row.get("content_excerpt") or ""),
        str(row.get("meta_description") or ""),
    ]
    return " ".join(p for p in parts if p.strip())


def spell_check_issues(df: pd.DataFrame, *, max_pages: int = 50) -> tuple[list[dict], Optional[str]]:
    """Return (issues, skip_reason). skip_reason set when pyspellchecker is missing."""
    issues: list[dict] = []
    try:
        from spellchecker import SpellChecker  # type: ignore[import-untyped]
    except ImportError:
        return issues, "pyspellchecker not installed (pip install -r requirements.txt)"
    spell = SpellChecker()
    checked = 0
    for _, row in df.iterrows():
        if checked >= max_pages:
            break
        status = str(row.get("status") or "")
        if not status.startswith("2"):
            continue
        excerpt = _spell_text_parts(row).strip()
        if len(excerpt) < 40:
            continue
        words = re.findall(r"[a-zA-Z']{4,}", excerpt.lower())
        if not words:
            continue
        unknown = spell.unknown(words[:120])
        # Count every page actually spell-checked, not only flagged ones, so
        # max_pages bounds the expensive spell.unknown() work (the cap previously
        # incremented only when an issue was appended).
        checked += 1
        if len(unknown) >= 3:
            url = str(row.get("url") or "")
            sample = ", ".join(sorted(unknown)[:5])
            issues.append(_issue(
                f"Possible spelling issues ({sample}).",
                url=url,
                priority="Low",
                recommendation="Review title, H1, and visible copy for typos.",
            ))
    return issues[:20], None


def html_validation_issues(df: pd.DataFrame, *, max_pages: int = 30) -> tuple[list[dict], bool]:
    """Return issues and whether html5lib parser was used."""
    issues: list[dict] = []
    use_parser = False
    try:
        import html5lib  # type: ignore[import-untyped]  # noqa: F401
        use_parser = True
    except ImportError:
        use_parser = False

    checked = 0
    for _, row in df.iterrows():
        if checked >= max_pages:
            break
        html = str(row.get("html") or "")
        if len(html) < 100:
            continue
        url = str(row.get("url") or "")
        # Count every page actually parsed, not only flagged ones, so max_pages
        # bounds the expensive HTML parse/scan (was incremented only on warnings).
        checked += 1
        warnings: list[str] = []
        if use_parser:
            try:
                from html5lib import HTMLParser  # type: ignore[import-untyped]

                parser = HTMLParser()
                parser.parse(html)
            except Exception as exc:
                warnings.append(f"parser error: {exc}")
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
    return issues, use_parser


def amp_audit_issues(df: pd.DataFrame) -> list[dict]:
    issues: list[dict] = []
    if df is None or df.empty:
        return issues
    for _, row in df.iterrows():
        url = str(row.get("url") or "")
        pa = _parse_page_analysis(row.get("page_analysis"))
        pag = pa.get("pagination") if isinstance(pa.get("pagination"), dict) else {}
        amphtml = pag.get("amphtml")
        is_amp = "/amp" in urlparse(url).path.lower() or bool(
            re.search(r"\bamp\b", str(row.get("content_type") or ""), re.I)
        )
        if not amphtml and not is_amp:
            continue
        canon = str(row.get("canonical_url") or "").strip()
        if not canon:
            issues.append(_issue(
                "AMP or amphtml variant missing canonical URL.",
                url=url,
                priority="Medium",
                recommendation="Add canonical link pointing to the preferred non-AMP URL.",
            ))
        elif amphtml and canon and amphtml.rstrip("/") != canon.rstrip("/") and is_amp:
            issues.append(_issue(
                "AMP page canonical does not match linked amphtml href.",
                url=url,
                priority="Medium",
                recommendation="Align canonical URL with amphtml pairing for AMP variants.",
            ))
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
        cache_key = url.rstrip("/")
        with _WAYBACK_LOCK:
            cached = _WAYBACK_CACHE.get(cache_key, None)
        if cached is not None:
            if cached:
                issues.append(_issue(
                    "404 URL has Wayback snapshot (Estimated).",
                    url=url,
                    priority="Low",
                    recommendation="Review whether redirect or content restoration is appropriate.",
                ))
                looked += 1
            continue
        # Every uncached 404 here triggers a Wayback network request; count it
        # against max_lookups whether or not a snapshot is found (and even if the
        # request fails). Previously only snapshots-found counted, so a site full
        # of snapshot-less 404s issued one request per 404 with no effective cap.
        looked += 1
        try:
            resp = requests.get(
                "https://archive.org/wayback/available",
                params={"url": url},
                timeout=8,
            )
            data = resp.json()
            snap = (data.get("archived_snapshots") or {}).get("closest") or {}
            available = bool(snap.get("available"))
            with _WAYBACK_LOCK:
                _WAYBACK_CACHE[cache_key] = available
            if available:
                ts = snap.get("timestamp") or "unknown"
                issues.append(_issue(
                    f"404 URL has Wayback snapshot (Estimated, captured {ts}).",
                    url=url,
                    priority="Low",
                    recommendation="Review whether redirect or content restoration is appropriate.",
                ))
        except Exception:
            with _WAYBACK_LOCK:
                _WAYBACK_CACHE[cache_key] = False
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

    emit_progress("optional", "pagination", message="Checking pagination links")
    pag = pagination_issues(df)
    if pag and tech is not None:
        tech.setdefault("issues", []).extend(pag)
        tech["issues"] = _sort_issues(tech["issues"])
        extras["pagination_issues"] = len(pag)

    if get_bool(cfg, "enable_spell_check", False) and content is not None:
        emit_progress("optional", "spell_check", message="Spell-checking excerpts")
        spell, skip = spell_check_issues(df)
        if skip:
            extras["spell_check_skipped"] = skip
            print(f"Warning: {skip}", file=sys.stderr, flush=True)
        if spell:
            content.setdefault("issues", []).extend(spell)
            content["issues"] = _sort_issues(content["issues"])
            extras["spell_check_pages"] = len(spell)

    if get_bool(cfg, "enable_html_validation", False) and tech is not None:
        emit_progress("optional", "html_validation", message="Validating HTML structure")
        html_issues, used_parser = html_validation_issues(df)
        extras["html_validation_parser"] = "html5lib" if used_parser else "regex"
        if html_issues:
            tech.setdefault("issues", []).extend(html_issues)
            tech["issues"] = _sort_issues(tech["issues"])
            extras["html_validation_pages"] = len(html_issues)

    if get_bool(cfg, "enable_amp_audit", False) and tech is not None:
        emit_progress("optional", "amp_audit", message="AMP canonical pairing audit")
        amp = amp_audit_issues(df)
        if amp:
            tech.setdefault("issues", []).extend(amp)
            tech["issues"] = _sort_issues(tech["issues"])
            extras["amp_audit_issues"] = len(amp)

    if get_bool(cfg, "enable_wayback_lookup", False) and tech is not None:
        emit_progress("optional", "wayback", message="Wayback lookup for 404 URLs")
        wb = wayback_issues(df)
        if wb:
            tech.setdefault("issues", []).extend(wb)
            tech["issues"] = _sort_issues(tech["issues"])
            extras["wayback_404_checked"] = len(wb)

    if get_bool(cfg, "enable_axe", False) and a11y is not None:
        render_mode = str(cfg.get("crawl_render_mode") or "static").strip().lower()
        if render_mode == "static":
            extras["axe_skipped"] = "enable_axe requires javascript or auto crawl rendering"
            print(
                "Warning: enable_axe is set but crawl_render_mode=static; axe runs only on browser-rendered pages.",
                file=sys.stderr,
                flush=True,
            )
        else:
            emit_progress("optional", "axe", message="Collecting axe accessibility violations")
            axe = axe_issues_from_df(df)
            if axe:
                a11y.setdefault("issues", []).extend(axe)
                a11y["issues"] = _sort_issues(a11y["issues"])
                extras["axe_violation_count"] = len(axe)

    emit_progress("optional", "done", message="Optional audits complete")
    return extras
