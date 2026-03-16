"""
Map site warnings (Lighthouse, axe, or plain list) to detection method, affected metrics,
severity, and one-line actionable fix. Outputs JSON mapping and human summary.
"""
import json
import os
import sys
from typing import Any


# Mapping: audit/rule id or phrase -> detection, primary_impact, secondary_impacts, explanation, one_line_fix, severity
# primary_impact one of: LCP, CLS, FID, Accessibility, SEO, UX
# severity: High (likely to move CWV across thresholds), Medium, Low
AUDIT_MAP: dict[str, dict[str, Any]] = {
    # Lighthouse performance / CWV
    "largest-contentful-paint": {
        "detection": "Lighthouse audit largest-contentful-paint",
        "primary_impact": "LCP",
        "secondary_impacts": ["FID"],
        "explanation": "Lighthouse measures the largest contentful paint from the trace; slow LCP usually means slow server, render-blocking resources, or large images.",
        "one_line_fix": "Add <link rel=\"preload\" as=\"image\" href=\"/path/to/lcp-image\"> or reduce server TTFB and render-blocking resources.",
        "severity": "High",
    },
    "cumulative-layout-shift": {
        "detection": "Lighthouse audit cumulative-layout-shift",
        "primary_impact": "CLS",
        "secondary_impacts": ["UX"],
        "explanation": "CLS is computed from layout shift events in the trace; unstable layout is often caused by images/ads without dimensions or late-injected content.",
        "one_line_fix": "Add width and height attributes to <img> (or CSS aspect-ratio) to reserve space and avoid layout shift.",
        "severity": "High",
    },
    "total-blocking-time": {
        "detection": "Lighthouse audit total-blocking-time",
        "primary_impact": "FID",
        "secondary_impacts": ["LCP", "UX"],
        "explanation": "TBT sums blocking time after FCP; long tasks block the main thread and hurt interactivity.",
        "one_line_fix": "Break up long tasks (code-split, defer non-critical JS) or reduce main-thread work.",
        "severity": "High",
    },
    "first-contentful-paint": {
        "detection": "Lighthouse audit first-contentful-paint",
        "primary_impact": "LCP",
        "secondary_impacts": ["UX"],
        "explanation": "FCP is when the first text or image is painted; delayed by render-blocking CSS/JS and slow TTFB.",
        "one_line_fix": "Reduce render-blocking resources (inline critical CSS, defer non-critical JS) and improve TTFB.",
        "severity": "High",
    },
    "render-blocking-resources": {
        "detection": "Lighthouse audit render-blocking-resources (network trace + first paint)",
        "primary_impact": "LCP",
        "secondary_impacts": ["FID", "UX"],
        "explanation": "Lighthouse identifies stylesheets and scripts that block first paint in the critical path.",
        "one_line_fix": "Add <link rel=\"preload\" as=\"style\" href=\"critical.css\"> or inline critical CSS and defer non-critical JS.",
        "severity": "High",
    },
    "unused-css-rules": {
        "detection": "Lighthouse audit unused-css-rules",
        "primary_impact": "LCP",
        "secondary_impacts": ["FID"],
        "explanation": "Large or unused CSS increases parse time and can block rendering.",
        "one_line_fix": "Remove unused CSS or use critical CSS and load the rest asynchronously.",
        "severity": "Medium",
    },
    "uses-responsive-images": {
        "detection": "Lighthouse audit uses-responsive-images",
        "primary_impact": "LCP",
        "secondary_impacts": [],
        "explanation": "Serving oversized images wastes bandwidth and can slow LCP.",
        "one_line_fix": "Use srcset and sizes (or picture) to serve appropriately sized images.",
        "severity": "Medium",
    },
    "uses-optimized-images": {
        "detection": "Lighthouse audit uses-optimized-images",
        "primary_impact": "LCP",
        "secondary_impacts": [],
        "explanation": "Unoptimized images (e.g. PNG where WebP is supported) increase payload and load time.",
        "one_line_fix": "Serve images in modern formats (e.g. WebP/AVIF) with fallbacks.",
        "severity": "Medium",
    },
    "efficient-animated-content": {
        "detection": "Lighthouse audit efficient-animated-content",
        "primary_impact": "FID",
        "secondary_impacts": ["CLS", "UX"],
        "explanation": "Animations using non-compositor properties (e.g. width/height) can cause main-thread jank.",
        "one_line_fix": "Use CSS transform/opacity for animations or requestAnimationFrame for JS animations.",
        "severity": "Medium",
    },
    "image-aspect-ratio": {
        "detection": "Lighthouse audit image-aspect-ratio (or DOM: img without width/height)",
        "primary_impact": "CLS",
        "secondary_impacts": ["UX"],
        "explanation": "Images without dimensions cause layout shift when they load; the audit checks for width/height or aspect-ratio.",
        "one_line_fix": "Add width and height attributes to <img> (or CSS aspect-ratio) to reserve space.",
        "severity": "High",
    },
    "preload-lcp-image": {
        "detection": "Lighthouse audit preload-lcp-image",
        "primary_impact": "LCP",
        "secondary_impacts": [],
        "explanation": "Preloading the LCP image can reduce LCP by starting the request earlier.",
        "one_line_fix": "Add <link rel=\"preload\" as=\"image\" href=\"/path/to/lcp-image\"> for the LCP element.",
        "severity": "High",
    },
    "document-title": {
        "detection": "Lighthouse audit document-title",
        "primary_impact": "SEO",
        "secondary_impacts": ["UX"],
        "explanation": "Missing or empty document title hurts SEO and tab identification.",
        "one_line_fix": "Add a unique <title> tag (e.g. <title>Page Name | Site</title>).",
        "severity": "Medium",
    },
    "meta-description": {
        "detection": "Lighthouse audit meta-description",
        "primary_impact": "SEO",
        "secondary_impacts": ["UX"],
        "explanation": "Missing meta description reduces snippet quality in search results.",
        "one_line_fix": "Add <meta name=\"description\" content=\"...\"> with a concise description.",
        "severity": "Medium",
    },
    "link-text": {
        "detection": "Lighthouse/axe: link has non-descriptive text",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["UX"],
        "explanation": "Links like 'click here' are not accessible to screen readers.",
        "one_line_fix": "Use descriptive link text (e.g. 'Download report' instead of 'click here').",
        "severity": "Medium",
    },
    "image-alt": {
        "detection": "Lighthouse/axe: image missing alt",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["SEO"],
        "explanation": "Images without alt text are not announced by screen readers.",
        "one_line_fix": "Add alt attribute to <img> (use alt=\"\" for decorative images).",
        "severity": "High",
    },
    "color-contrast": {
        "detection": "Lighthouse/axe: color contrast",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["UX"],
        "explanation": "Low contrast between text and background fails WCAG.",
        "one_line_fix": "Increase contrast ratio (e.g. darker text or lighter background) to meet WCAG AA.",
        "severity": "High",
    },
    "button-name": {
        "detection": "axe: button or icon button has no accessible name",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["UX"],
        "explanation": "Buttons without a name are not announced by assistive tech.",
        "one_line_fix": "Add aria-label or visible text to the button.",
        "severity": "High",
    },
    "label": {
        "detection": "axe: form control missing label",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["UX"],
        "explanation": "Inputs without labels are not associated for screen readers.",
        "one_line_fix": "Add <label for=\"id\"> or aria-label to the form control.",
        "severity": "High",
    },
    "heading-order": {
        "detection": "axe: heading levels skip or are out of order",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["SEO"],
        "explanation": "Headings should form a logical outline (h1 then h2, etc.).",
        "one_line_fix": "Use heading levels in order (e.g. h1, then h2, no skipped levels).",
        "severity": "Medium",
    },
    "duplicate-id": {
        "detection": "axe: duplicate id attribute",
        "primary_impact": "Accessibility",
        "secondary_impacts": ["UX"],
        "explanation": "Duplicate IDs break label/for and ARIA references.",
        "one_line_fix": "Ensure each id value is unique in the document.",
        "severity": "Medium",
    },
    "aria-allowed-attr": {
        "detection": "axe: ARIA attribute not allowed on element",
        "primary_impact": "Accessibility",
        "secondary_impacts": [],
        "explanation": "Invalid ARIA can confuse assistive technologies.",
        "one_line_fix": "Remove or replace the invalid ARIA attribute per ARIA spec.",
        "severity": "Medium",
    },
    "csp-xss": {
        "detection": "Lighthouse audit csp-xss",
        "primary_impact": "SEO",
        "secondary_impacts": ["UX"],
        "explanation": "Content Security Policy can mitigate XSS; missing or weak CSP is flagged.",
        "one_line_fix": "Add a Content-Security-Policy header (or meta tag) with at least default-src and script-src.",
        "severity": "Medium",
    },
}

# Fallback for unknown audits: generic entry
DEFAULT_ENTRY = {
    "detection": "Lighthouse/axe audit or manual warning",
    "primary_impact": "UX",
    "secondary_impacts": [],
    "explanation": "This warning was detected by the tool; see audit helpText for details.",
    "one_line_fix": "Review the audit recommendation and fix the underlying issue.",
    "severity": "Medium",
}

# Phrase substring -> audit id (for plain list matching)
PHRASE_TO_ID: list[tuple[str, str]] = [
    ("render-blocking", "render-blocking-resources"),
    ("largest contentful paint", "largest-contentful-paint"),
    ("lcp", "largest-contentful-paint"),
    ("cumulative layout shift", "cumulative-layout-shift"),
    ("cls", "cumulative-layout-shift"),
    ("total blocking time", "total-blocking-time"),
    ("tbt", "total-blocking-time"),
    ("first contentful paint", "first-contentful-paint"),
    ("fcp", "first-contentful-paint"),
    ("width", "image-aspect-ratio"),
    ("height", "image-aspect-ratio"),
    ("image without", "image-aspect-ratio"),
    ("dimensions", "image-aspect-ratio"),
    ("aspect-ratio", "image-aspect-ratio"),
    ("preload", "preload-lcp-image"),
    ("document title", "document-title"),
    ("meta description", "meta-description"),
    ("alt", "image-alt"),
    ("contrast", "color-contrast"),
    ("link text", "link-text"),
    ("button name", "button-name"),
    ("label", "label"),
    ("heading", "heading-order"),
    ("duplicate id", "duplicate-id"),
    ("aria", "aria-allowed-attr"),
    ("unused css", "unused-css-rules"),
    ("responsive image", "uses-responsive-images"),
    ("optimized image", "uses-optimized-images"),
]


def _resolve_entry(audit_id: str, title: str | None, help_text: str | None) -> dict[str, Any]:
    """Get mapping entry for audit id or phrase match."""
    aid = (audit_id or "").strip().lower()
    if aid and aid in AUDIT_MAP:
        return dict(AUDIT_MAP[aid])
    text = f"{title or ''} {help_text or ''}".lower()
    for phrase, mapped_id in PHRASE_TO_ID:
        if phrase in text or phrase in aid:
            return dict(AUDIT_MAP.get(mapped_id, DEFAULT_ENTRY))
    return dict(DEFAULT_ENTRY)


def _build_output_item(
    warning: str,
    entry: dict[str, Any],
    references: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "warning": warning,
        "detection": entry.get("detection", DEFAULT_ENTRY["detection"]),
        "primary_impact": entry.get("primary_impact", "UX"),
        "secondary_impacts": list(entry.get("secondary_impacts") or []),
        "explanation": entry.get("explanation", DEFAULT_ENTRY["explanation"]),
        "one_line_fix": entry.get("one_line_fix", DEFAULT_ENTRY["one_line_fix"]),
        "severity": entry.get("severity", "Medium"),
    }
    if references:
        out["references"] = references
    return out


def parse_lighthouse(path: str) -> list[dict[str, Any]]:
    """Parse Lighthouse JSON and return list of output items."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    lr = data.get("lighthouseResult") or data
    audits = lr.get("audits") or {}
    results: list[dict[str, Any]] = []
    for audit_id, audit in audits.items():
        if audit is None:
            continue
        score = audit.get("score")
        if score is not None and score >= 1:
            continue
        title = audit.get("title") or audit_id
        help_text = audit.get("helpText") or ""
        warning = title if title else audit_id
        if help_text:
            warning = f"{title}: {help_text}"[:200]
        entry = _resolve_entry(audit_id, title, help_text)
        refs: dict[str, Any] = {"lighthouse_audit_id": audit_id}
        if "details" in audit and isinstance(audit["details"], dict):
            nodes = audit["details"].get("items") or audit["details"].get("nodes")
            if nodes:
                refs["nodes"] = nodes[:10] if isinstance(nodes, list) else nodes
        results.append(_build_output_item(warning, entry, refs))
    return results


def parse_axe(path: str) -> list[dict[str, Any]]:
    """Parse axe-core results JSON and return list of output items."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    violations = data.get("violations") or []
    results: list[dict[str, Any]] = []
    for v in violations:
        rule_id = v.get("id") or ""
        help_text = v.get("help") or ""
        desc = v.get("description") or ""
        warning = f"{help_text}: {desc}"[:200]
        entry = _resolve_entry(rule_id, help_text, desc)
        refs: dict[str, Any] = {"lighthouse_audit_id": rule_id}
        nodes = v.get("nodes") or []
        if nodes:
            refs["nodes"] = [n.get("target") or n.get("html") for n in nodes[:10]]
        results.append(_build_output_item(warning, entry, refs))
    return results


def parse_plain_list(path: str) -> list[dict[str, Any]]:
    """Parse plain text file (one warning per line) and return list of output items."""
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f if ln.strip()]
    results: list[dict[str, Any]] = []
    for line in lines:
        entry = _resolve_entry("", line, line)
        results.append(_build_output_item(line, entry, None))
    return results


def map_warnings(
    input_path: str,
    input_type: str,
) -> list[dict[str, Any]]:
    """Dispatch to Lighthouse, axe, or plain list parser. Returns list of output objects."""
    input_type = (input_type or "lighthouse").lower()
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
    if input_type == "lighthouse":
        return parse_lighthouse(input_path)
    if input_type == "axe":
        return parse_axe(input_path)
    if input_type in ("list", "plain", "text"):
        return parse_plain_list(input_path)
    raise ValueError(f"Unknown input_type: {input_type}. Use lighthouse, axe, or list.")


def human_summary_paragraph(items: list[dict[str, Any]], top_n: int = 5) -> str:
    """One paragraph listing top N High-severity fixes in priority order."""
    high = [i for i in items if i.get("severity") == "High"]
    high.sort(key=lambda x: (
        {"LCP": 0, "CLS": 1, "FID": 2, "Accessibility": 3, "SEO": 4, "UX": 5}.get(x.get("primary_impact") or "UX", 6),
        x.get("warning", ""),
    ))
    top = high[:top_n]
    if not top:
        return "No High-severity fixes; review Medium and Low items in the JSON output."
    parts = [f"Top {len(top)} High-severity fixes (priority order):"]
    for i, o in enumerate(top, 1):
        fix = (o.get("one_line_fix") or "").strip()[:120]
        parts.append(f" {i}. {fix}")
    return " ".join(parts)


def main(
    input_path: str,
    input_type: str = "lighthouse",
    output_path: str = "warnings_mapped.json",
) -> int:
    """
    Run warning mapper and write JSON + print human summary.
    Returns 0 on success, non-zero on error.
    """
    if not input_path or not input_path.strip():
        print("warning_mapper_input is required. Set it in config or pass the Lighthouse/axe/list file path.", file=sys.stderr)
        return 1
    input_path = input_path.strip()
    if not os.path.isabs(input_path):
        input_path = os.path.abspath(input_path)
    try:
        items = map_warnings(input_path, input_type)
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        return 1
    except (ValueError, json.JSONDecodeError) as e:
        print(str(e), file=sys.stderr)
        return 1

    output = {
        "warnings": items,
        "human_summary": human_summary_paragraph(items, 5),
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=str)
    print(output["human_summary"])
    print(f"Written to {output_path}")
    return 0
