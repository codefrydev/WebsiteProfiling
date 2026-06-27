"""Normalize Lighthouse audit text across LHR schema versions."""
from __future__ import annotations

from typing import Any

_CWV_IMPACTS = frozenset({"LCP", "CLS", "FID"})


def audit_title(audit: dict[str, Any], audit_id: str = "") -> str:
    """Short display title from a Lighthouse audit dict."""
    return str(audit.get("title") or audit_id or "Audit failed").strip()


def audit_help_text(audit: dict[str, Any]) -> str:
    """Longer help text: modern ``description``, legacy ``helpText``."""
    return str(audit.get("description") or audit.get("helpText") or "").strip()


def failure_help_text(failure: dict[str, Any]) -> str:
    """Help text from a ``top_failures`` row (supports both field names)."""
    return str(failure.get("helpText") or failure.get("description") or "").strip()


def failure_display_message(failure: dict[str, Any]) -> str:
    """Build a user-facing issue message from a ``top_failures`` row."""
    aid = str(failure.get("id") or "").strip()
    title = str(failure.get("title") or "").strip()
    help_text = failure_help_text(failure)
    if not title and aid:
        title = aid.replace("-", " ").title()
    if title and help_text and title.casefold() != help_text.casefold():
        return f"{title}: {help_text}"[:240]
    if title:
        return title[:240]
    if help_text:
        return help_text[:240]
    return "Audit failed"


def failure_row_from_audit(
    audit_id: str,
    audit: dict[str, Any],
    *,
    category: str | None = None,
    impact: str | None = None,
    evidence: list[str] | None = None,
) -> dict[str, Any]:
    """Build a normalized ``top_failures`` entry from a Lighthouse audit."""
    title = audit_title(audit, audit_id)
    help_text = audit_help_text(audit)
    row: dict[str, Any] = {
        "id": audit_id,
        "score": audit.get("score"),
        "title": title,
        "helpText": help_text,
        "impact": impact,
        "evidence": evidence or [],
    }
    if category:
        row["category"] = category
    return row


def is_core_web_vitals_failure(failure: dict[str, Any], *, resolve_impact) -> bool:
    """True when a failure belongs in the Core Web Vitals category."""
    category = str(failure.get("category") or failure.get("category_id") or "").strip()
    if category:
        return category == "performance"
    impact = str(failure.get("impact") or "").strip()
    if not impact:
        aid = str(failure.get("id") or "")
        title = str(failure.get("title") or "")
        help_text = failure_help_text(failure)
        impact = resolve_impact(aid, title, help_text)
    return impact in _CWV_IMPACTS
