"""Agent documentation readiness tools (agentic-seo parity).

Score model (100 pts, A-F grades):
  Discovery          /25 - robots (10) + llms.txt (10) + agents.md (5)
  Content structure  /25 - headings, semantic HTML, code blocks, tables
  Token economics    /25 - per-page token budget (15) + meta completeness (10)
  Capability signaling /15 - skill.md (10) + agent-permissions.json (5)
  UX bridge          /10 - copy-for-AI / raw-view affordances

Grade bands: A 90-100 · B 75-89 · C 60-74 · D 40-59 · F 0-39
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from psycopg import Connection

from .._aeo_helpers import (
    count_tokens,
    detect_copy_for_ai,
    is_doc_like_url,
    score_agents_md_content,
    score_content_structure_aeo,
    strip_html_to_text,
)
from .._slice import cap_list, parse_limit
from ..context import AuditToolContext
from .geo_tools import _base_url, _fetch_llms_txt, _score_meta_signals, _score_robots_ai_access

_DEFAULT_MAX_TOKENS = 25_000
_DEFAULT_WARN_TOKENS = 8_000

# Candidate filenames for agents.md detection
_AGENTS_MD_PATHS = (
    "/AGENTS.md",
    "/CLAUDE.md",
    "/GEMINI.md",
    "/AGENT.md",
    "/.well-known/agents.md",
)

_GRADE_BANDS = (
    (90, "A"),
    (75, "B"),
    (60, "C"),
    (40, "D"),
    (0, "F"),
)


def _grade(score: float) -> str:
    for threshold, letter in _GRADE_BANDS:
        if score >= threshold:
            return letter
    return "F"


def _http_get(url: str, timeout: int = 8) -> requests.Response | None:
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "SiteAudit/1.0"})
        if r.status_code == 200 and r.text.strip():
            return r
    except requests.RequestException:
        pass
    return None


# ---------------------------------------------------------------------------
# Discovery: agents.md
# ---------------------------------------------------------------------------

def _fetch_agents_md(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found": False, "error": "domain unknown"}
    base = _base_url(domain)
    for path in _AGENTS_MD_PATHS:
        url = urljoin(base + "/", path.lstrip("/"))
        resp = _http_get(url)
        if resp is not None:
            text = resp.text.strip()
            content_signals = score_agents_md_content(text)
            return {
                "found": True,
                "url": url,
                "size_bytes": len(resp.content),
                "preview": text[:500],
                **content_signals,
            }
    return {
        "found": False,
        "checked_urls": [urljoin(base + "/", p.lstrip("/")) for p in _AGENTS_MD_PATHS],
    }


def get_agents_md_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check for AGENTS.md / CLAUDE.md / GEMINI.md / AGENT.md with content quality scoring."""
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_agents_md(domain)
    result["domain"] = domain
    result["provenance"] = "Live HTTP"
    return result


# ---------------------------------------------------------------------------
# Capability signaling: skill.md
# ---------------------------------------------------------------------------

def _score_skill_md_content(text: str) -> dict[str, Any]:
    """Score skill.md content quality (max 10 pts)."""
    has_description = bool(re.search(r"(?:description|what it does|capability|about)", text, re.I))
    has_inputs = bool(re.search(r"(?:input|param|arg|argument|require)", text, re.I))
    has_constraints = bool(re.search(r"(?:constraint|limit|scope|not support|restriction)", text, re.I))
    has_examples = bool(re.search(r"(?:example|usage|sample|e\.g\.)", text, re.I))
    word_count = len(text.split())
    points = 0
    if has_description:
        points += 4
    if has_inputs:
        points += 2
    if has_constraints:
        points += 2
    if has_examples:
        points += 2
    return {
        "has_description": has_description,
        "has_inputs": has_inputs,
        "has_constraints": has_constraints,
        "has_examples": has_examples,
        "word_count": word_count,
        "skill_content_score": min(10, points),
    }


def _fetch_skill_md(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found": False, "error": "domain unknown"}
    base = _base_url(domain)
    for path in ("/skill.md", "/.well-known/skill.md", "/SKILL.md"):
        url = urljoin(base + "/", path.lstrip("/"))
        resp = _http_get(url)
        if resp is not None:
            text = resp.text.strip()
            signals = _score_skill_md_content(text)
            return {
                "found": True,
                "url": url,
                "size_bytes": len(resp.content),
                "preview": text[:400],
                **signals,
            }
    return {
        "found": False,
        "checked_urls": [urljoin(base + "/", p.lstrip("/")) for p in ("/skill.md", "/.well-known/skill.md", "/SKILL.md")],
    }


def get_skill_md_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check for /skill.md with capability description, inputs, and constraints scoring."""
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_skill_md(domain)
    result["domain"] = domain
    result["provenance"] = "Live HTTP"
    return result


# ---------------------------------------------------------------------------
# Capability signaling: agent-permissions.json
# ---------------------------------------------------------------------------

def _fetch_agent_permissions(domain: str) -> dict[str, Any]:
    if not domain:
        return {"found": False, "error": "domain unknown"}
    base = _base_url(domain)
    for path in ("/agent-permissions.json", "/.well-known/agent-permissions.json"):
        url = urljoin(base + "/", path.lstrip("/"))
        resp = _http_get(url)
        if resp is not None:
            text = resp.text.strip()
            parse_error = None
            parsed: dict[str, Any] = {}
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                parse_error = str(exc)
            has_allowed_tools = "allowed_tools" in parsed
            has_rate_limits = "rate_limits" in parsed
            has_scope = "scope" in parsed
            return {
                "found": True,
                "url": url,
                "size_bytes": len(resp.content),
                "valid_json": parse_error is None,
                "parse_error": parse_error,
                "has_allowed_tools": has_allowed_tools,
                "has_rate_limits": has_rate_limits,
                "has_scope": has_scope,
                "keys": list(parsed.keys()) if isinstance(parsed, dict) else [],
            }
    return {
        "found": False,
        "checked_urls": [
            urljoin(base + "/", p.lstrip("/"))
            for p in ("/agent-permissions.json", "/.well-known/agent-permissions.json")
        ],
    }


def get_agent_permissions_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check for /agent-permissions.json with loose JSON schema validation."""
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    result = _fetch_agent_permissions(domain)
    result["domain"] = domain
    result["provenance"] = "Live HTTP"
    return result


# ---------------------------------------------------------------------------
# Token economics: per-page token budget
# ---------------------------------------------------------------------------

def _token_count_for_row(rec: dict[str, Any], max_tokens: int, warn_tokens: int) -> dict[str, Any]:
    html = str(rec.get("html") or "")
    excerpt = str(rec.get("content_excerpt") or "")
    # Prefer full HTML if available; fall back to excerpt
    text = strip_html_to_text(html) if html else excerpt
    tokens = count_tokens(text) if text else 0
    return {
        "url": str(rec.get("url") or ""),
        "title": str(rec.get("title") or ""),
        "token_count": tokens,
        "over_max": tokens > max_tokens,
        "over_warn": tokens > warn_tokens,
    }


def get_token_budget_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Token budget summary across crawled pages (approximate, cl100k_base encoder).

    Config overrides: agent_readiness_max_tokens_per_page (default 25000),
                      agent_readiness_warn_tokens (default 8000).
    """
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True, "total_pages": 0, "provenance": "Estimated"}

    max_tokens = int(args.get("max_tokens_per_page") or _DEFAULT_MAX_TOKENS)
    warn_tokens = int(args.get("warn_tokens") or _DEFAULT_WARN_TOKENS)

    pages_data: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        pages_data.append(_token_count_for_row(rec, max_tokens, warn_tokens))

    if not pages_data:
        return {"total_pages": 0, "provenance": "Estimated"}

    all_counts = [p["token_count"] for p in pages_data]
    all_counts_sorted = sorted(all_counts)
    total = len(all_counts_sorted)
    over_max = sum(1 for p in pages_data if p["over_max"])
    over_warn = sum(1 for p in pages_data if p["over_warn"])
    p50 = all_counts_sorted[total // 2] if total else 0
    p95 = all_counts_sorted[int(total * 0.95)] if total else 0
    worst = sorted(pages_data, key=lambda p: -p["token_count"])[:10]

    # Budget score /15: penalise by fraction of pages over warn
    warn_fraction = over_warn / total if total else 0
    max_fraction = over_max / total if total else 0
    budget_score = max(0, round(15 * (1 - warn_fraction) - max_fraction * 5))

    return {
        "total_pages": total,
        "pages_over_max": over_max,
        "pages_over_warn": over_warn,
        "max_tokens_threshold": max_tokens,
        "warn_tokens_threshold": warn_tokens,
        "p50_tokens": p50,
        "p95_tokens": p95,
        "worst_pages": worst,
        "budget_score": min(15, budget_score),
        "provenance": "Estimated",
    }


def list_oversized_pages_for_agents(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """List pages exceeding the warn token threshold (default 8000 tokens)."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}

    max_tokens = int(args.get("max_tokens_per_page") or _DEFAULT_MAX_TOKENS)
    warn_tokens = int(args.get("warn_tokens") or _DEFAULT_WARN_TOKENS)
    limit = parse_limit(args.get("limit"), 30, 50)

    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        p = _token_count_for_row(rec, max_tokens, warn_tokens)
        if p["over_warn"]:
            pages.append(p)

    pages.sort(key=lambda p: -p["token_count"])
    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "warn_threshold": warn_tokens,
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Content structure AEO (site aggregate)
# ---------------------------------------------------------------------------

def get_content_structure_aeo_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Site-wide content structure score for agent readiness (headings, semantic HTML, code, tables)."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True, "total_pages": 0, "provenance": "Estimated"}

    total = 0
    score_sum = 0
    has_h2_count = 0
    has_semantic_count = 0
    has_code_count = 0
    has_table_count = 0
    page_scores: list[dict[str, Any]] = []

    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        html = str(rec.get("html") or "")
        excerpt = str(rec.get("content_excerpt") or "")
        seq = str(rec.get("heading_sequence") or "")
        signals = score_content_structure_aeo(html, excerpt, seq)
        total += 1
        score_sum += signals["structure_score"]
        if signals["has_h2"]:
            has_h2_count += 1
        if signals["unique_semantic_landmarks"] > 0:
            has_semantic_count += 1
        if signals["code_blocks"] > 0:
            has_code_count += 1
        if signals["tables"] > 0:
            has_table_count += 1
        page_scores.append({
            "url": str(rec.get("url") or ""),
            "title": str(rec.get("title") or ""),
            "structure_score": signals["structure_score"],
            "has_h2": signals["has_h2"],
            "has_semantic_landmarks": signals["unique_semantic_landmarks"] > 0,
            "code_blocks": signals["code_blocks"],
            "tables": signals["tables"],
        })

    if not total:
        return {"total_pages": 0, "provenance": "Estimated"}

    avg_score = round(score_sum / total, 1)
    # Site score /25: average of page scores normalised to 25-pt scale
    site_score = min(25, round(avg_score))

    page_scores.sort(key=lambda p: p["structure_score"])
    return {
        "total_pages": total,
        "average_structure_score": avg_score,
        "site_structure_score": site_score,
        "pages_with_h2": has_h2_count,
        "pages_with_semantic_landmarks": has_semantic_count,
        "pages_with_code_blocks": has_code_count,
        "pages_with_tables": has_table_count,
        "worst_pages": page_scores[:10],
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Markdown availability
# ---------------------------------------------------------------------------

_JS_EMPTY_WORDS_THRESHOLD = 50  # fewer words in static = likely JS-required


def _probe_markdown_sibling(url: str) -> bool:
    """Return True if a .md counterpart of the URL exists."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    if path.endswith(".html"):
        path = path[:-5]
    candidates = [path + ".md", path + "/index.md"]
    base = f"{parsed.scheme}://{parsed.netloc}"
    for cpath in candidates:
        full = base + cpath
        try:
            r = requests.head(full, timeout=5, headers={"User-Agent": "SiteAudit/1.0"}, allow_redirects=True)
            if r.status_code == 200:
                return True
        except requests.RequestException:
            pass
    return False


def _html_noise_ratio(html: str) -> float:
    """Return the tag-character ratio (tags / total chars). Lower = cleaner text."""
    if not html:
        return 0.0
    tag_chars = sum(len(m.group()) for m in re.finditer(r"<[^>]+>", html))
    return round(tag_chars / len(html), 2)


def get_markdown_availability_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check markdown source availability and HTML noise for doc-like pages."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True, "total_doc_pages": 0, "provenance": "Estimated"}

    probe_limit = int(args.get("probe_limit") or 10)  # live HTTP probes are slow
    doc_pages: list[dict[str, Any]] = []
    js_empty_count = 0

    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "")
        if not is_doc_like_url(url):
            continue
        html = str(rec.get("html") or "")
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        fetch_method = str(rec.get("fetch_method") or "static").lower()
        noise_ratio = _html_noise_ratio(html)
        is_js_empty = wc < _JS_EMPTY_WORDS_THRESHOLD and fetch_method == "static"
        if is_js_empty:
            js_empty_count += 1
        doc_pages.append({
            "url": url,
            "word_count": wc,
            "html_noise_ratio": noise_ratio,
            "fetch_method": fetch_method,
            "is_js_empty": is_js_empty,
        })

    total_doc = len(doc_pages)
    if not total_doc:
        return {"total_doc_pages": 0, "note": "no doc-like URLs found in crawl", "provenance": "Estimated"}

    # Probe markdown siblings for a sample
    probed_pages = doc_pages[:probe_limit]
    md_found = 0
    for page in probed_pages:
        if _probe_markdown_sibling(page["url"]):
            page["has_md_source"] = True
            md_found += 1
        else:
            page["has_md_source"] = False

    md_pct = round(md_found / len(probed_pages) * 100, 1) if probed_pages else 0
    js_empty_pct = round(js_empty_count / total_doc * 100, 1)
    avg_noise = round(sum(p["html_noise_ratio"] for p in doc_pages) / total_doc, 2)

    # Score /25: mainly markdown availability + low noise + no JS empties
    md_score = round(md_pct / 100 * 10)
    noise_score = max(0, 5 - round(avg_noise * 10))
    js_penalty = round(js_empty_pct / 100 * 10)
    markdown_score = min(25, md_score + noise_score + 10 - js_penalty)

    return {
        "total_doc_pages": total_doc,
        "probed_pages": len(probed_pages),
        "pages_with_md_source": md_found,
        "md_source_pct": md_pct,
        "js_empty_pages": js_empty_count,
        "js_empty_pct": js_empty_pct,
        "avg_html_noise_ratio": avg_noise,
        "markdown_score": markdown_score,
        "sample_pages": probed_pages,
        "provenance": "Estimated + Live HTTP (probe)",
    }


# ---------------------------------------------------------------------------
# Combined agent-unfriendly list
# ---------------------------------------------------------------------------

def list_pages_agent_unfriendly(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Pages with combined agent-readiness problems: high tokens, low structure, or JS-empty."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}

    warn_tokens = int(args.get("warn_tokens") or _DEFAULT_WARN_TOKENS)
    limit = parse_limit(args.get("limit"), 30, 50)

    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "")
        html = str(rec.get("html") or "")
        excerpt = str(rec.get("content_excerpt") or "")
        seq = str(rec.get("heading_sequence") or "")
        try:
            wc = int(rec.get("word_count") or 0)
        except (TypeError, ValueError):
            wc = 0
        fetch_method = str(rec.get("fetch_method") or "static").lower()

        reasons: list[str] = []

        # Token budget
        text = strip_html_to_text(html) if html else excerpt
        tokens = count_tokens(text) if text else 0
        if tokens > warn_tokens:
            reasons.append(f"oversized ({tokens} tokens)")

        # Structure
        signals = score_content_structure_aeo(html, excerpt, seq)
        if signals["structure_score"] < 5 and wc >= 200:
            reasons.append("poor content structure")

        # JS-empty
        if wc < _JS_EMPTY_WORDS_THRESHOLD and fetch_method == "static":
            reasons.append("js-only page (static empty)")

        if reasons:
            pages.append({
                "url": url,
                "title": str(rec.get("title") or ""),
                "token_count": tokens,
                "structure_score": signals["structure_score"],
                "reasons": reasons,
            })

    pages.sort(key=lambda p: -len(p["reasons"]))
    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# UX bridge: copy-for-AI signals
# ---------------------------------------------------------------------------

def get_copy_for_ai_signals(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Site-wide coverage of copy-for-AI / raw-view affordances."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True, "total_pages": 0, "provenance": "Estimated"}

    total = 0
    with_copy = 0
    doc_total = 0
    doc_with_copy = 0

    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        html = str(rec.get("html") or "")
        url = str(rec.get("url") or "")
        found = detect_copy_for_ai(html)
        total += 1
        if found:
            with_copy += 1
        if is_doc_like_url(url):
            doc_total += 1
            if found:
                doc_with_copy += 1

    all_pct = round(with_copy / total * 100, 1) if total else 0.0
    doc_pct = round(doc_with_copy / doc_total * 100, 1) if doc_total else 0.0
    # Score /10 from doc-like page coverage
    ux_score = min(10, round(doc_pct / 100 * 10)) if doc_total else min(10, round(all_pct / 100 * 10))

    return {
        "total_pages": total,
        "pages_with_copy_for_ai": with_copy,
        "all_pages_pct": all_pct,
        "doc_pages_total": doc_total,
        "doc_pages_with_copy_for_ai": doc_with_copy,
        "doc_pages_pct": doc_pct,
        "ux_score": ux_score,
        "provenance": "Estimated",
    }


def list_pages_missing_copy_for_ai(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """List doc-like pages without copy-for-AI affordances."""
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}

    limit = parse_limit(args.get("limit"), 30, 50)
    pages: list[dict[str, Any]] = []

    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        url = str(rec.get("url") or "")
        if not is_doc_like_url(url):
            continue
        html = str(rec.get("html") or "")
        if not detect_copy_for_ai(html):
            pages.append({
                "url": url,
                "title": str(rec.get("title") or ""),
            })

    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Estimated",
    }


# ---------------------------------------------------------------------------
# Composite score
# ---------------------------------------------------------------------------

def get_agent_readiness_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Agent documentation readiness score (0-100, A-F grade), 5-category breakdown.

    Categories (max pts):
      discovery /25, content_structure /25, token_economics /25,
      capability_signaling /15, ux_bridge /10
    """
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)

    max_tokens = int(args.get("max_tokens_per_page") or _DEFAULT_MAX_TOKENS)
    warn_tokens = int(args.get("warn_tokens") or _DEFAULT_WARN_TOKENS)

    # ---- crawl-based sub-scores (run synchronously, single DF load) ----
    df = scoped.load_crawl_df(conn)

    token_data = get_token_budget_summary(conn, scoped, args)
    structure_data = get_content_structure_aeo_summary(conn, scoped, args)
    copy_data = get_copy_for_ai_signals(conn, scoped, args)

    budget_score = int(token_data.get("budget_score") or 0)  # /15
    structure_score = int(structure_data.get("site_structure_score") or 0)  # /25
    ux_score = int(copy_data.get("ux_score") or 0)  # /10

    # ---- meta completeness for token_economics category ----
    def _meta_score_sync(d: str) -> dict[str, Any]:
        return _score_meta_signals(d)

    # ---- live HTTP checks (concurrent) ----
    http_tasks = {
        "robots": lambda d: _score_robots_ai_access(d),
        "llms": _fetch_llms_txt,
        "agents_md": _fetch_agents_md,
        "skill_md": _fetch_skill_md,
        "permissions": _fetch_agent_permissions,
        "meta": _meta_score_sync,
    }
    http_results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(fn, domain): key for key, fn in http_tasks.items()}
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                http_results[key] = fut.result()
            except Exception:
                http_results[key] = {}

    # ---- category: discovery /25 ----
    robots_score = int(http_results.get("robots", {}).get("robots_score") or 0)
    robots_pts = min(10, round(robots_score / 18 * 10))  # scale /18 → /10

    llms_data = http_results.get("llms", {})
    llms_found = llms_data.get("found", False)
    llms_depth = llms_data.get("depth", {})
    llms_pts = min(10, int(llms_depth.get("depth_score") or 0)) if llms_found else 0

    agents_data = http_results.get("agents_md", {})
    agents_found = agents_data.get("found", False)
    agents_content = int(agents_data.get("content_score") or 0)
    agents_pts = 2 if agents_found else 0
    agents_pts += min(3, agents_content)

    discovery_score = min(25, robots_pts + llms_pts + agents_pts)

    # ---- category: token economics /25 ----
    meta_data = http_results.get("meta", {})
    meta_score = int(meta_data.get("meta_score") or 0)
    meta_pts = min(10, meta_score)
    token_economics_score = min(25, budget_score + meta_pts)

    # ---- category: capability signaling /15 ----
    skill_data = http_results.get("skill_md", {})
    skill_found = skill_data.get("found", False)
    skill_pts = min(10, int(skill_data.get("skill_content_score") or 0)) if skill_found else 0

    perms_data = http_results.get("permissions", {})
    perms_found = perms_data.get("found", False)
    perms_pts = 0
    if perms_found:
        perms_pts = 3
        if perms_data.get("valid_json"):
            perms_pts += 1
        if perms_data.get("has_allowed_tools") or perms_data.get("has_scope"):
            perms_pts += 1

    capability_score = min(15, skill_pts + perms_pts)

    # ---- total ----
    total_score = discovery_score + structure_score + token_economics_score + capability_score + ux_score
    percentage = min(100, total_score)
    grade = _grade(percentage)

    return {
        "percentage": percentage,
        "grade": grade,
        "agent_readiness_score": percentage,
        "domain": domain,
        "categories": {
            "discovery": {"score": discovery_score, "max": 25},
            "content_structure": {"score": structure_score, "max": 25},
            "token_economics": {"score": token_economics_score, "max": 25},
            "capability_signaling": {"score": capability_score, "max": 15},
            "ux_bridge": {"score": ux_score, "max": 10},
        },
        "components": {
            "robots_ai_access": robots_pts,
            "llms_txt": llms_pts,
            "agents_md": agents_pts,
            "content_structure": structure_score,
            "token_budget": budget_score,
            "meta_completeness": meta_pts,
            "skill_md": skill_pts,
            "agent_permissions": perms_pts,
            "copy_for_ai": ux_score,
        },
        "findings": {
            "llms_txt": {"found": llms_found, "url": llms_data.get("url")},
            "agents_md": {"found": agents_found, "url": agents_data.get("url")},
            "skill_md": {"found": skill_found, "url": skill_data.get("url")},
            "agent_permissions": {"found": perms_found, "url": perms_data.get("url")},
            "pages_over_warn_tokens": int(token_data.get("pages_over_warn") or 0),
            "doc_pages_with_copy_for_ai_pct": float(copy_data.get("doc_pages_pct") or 0),
        },
        "provenance": "Crawl + Live HTTP",
    }


# ---------------------------------------------------------------------------
# Generator: agent readiness bundle
# ---------------------------------------------------------------------------

def generate_agent_readiness_bundle(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate draft files for agent readiness: AGENTS.md, skill.md, agent-permissions.json.

    Reuses existing draft_llms_txt and generate_robots_txt where applicable.
    """
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    df = scoped.load_crawl_df(conn)
    payload = scoped.load_payload(conn)

    # --- Draft AGENTS.md ---
    site_title = str(payload.get("site_title") or domain or "Your Project")
    top_pages = payload.get("top_pages") or []
    top_urls = [str(p.get("url") or "") for p in top_pages[:5] if isinstance(p, dict)]

    agents_md_lines = [
        f"# Agent instructions — {site_title}",
        "",
        f"**What it is:** Site at `{domain}` — {site_title}.",
        "",
        "**Key pages**",
        "",
    ]
    for url in top_urls:
        agents_md_lines.append(f"- {url}")
    if not top_urls:
        agents_md_lines.append(f"- https://{domain}/")
    agents_md_lines += [
        "",
        "**For agents:** Check `llms.txt` at the root for a structured content index.",
        "",
        "**Crawl scope:** Only crawl pages you have permission to access. Respect robots.txt.",
    ]

    # --- Draft skill.md ---
    mcp_note = ""
    if "mcp" in str(payload).lower() or df is not None:
        mcp_note = "\n**MCP:** Exposes read-only audit data via Model Context Protocol."

    skill_md_lines = [
        f"# Skill: {site_title}",
        "",
        f"**Description:** Access technical SEO audit data for `{domain}`.",
        mcp_note,
        "",
        "**Inputs:**",
        "- `property_id` (integer): the audited property identifier",
        "- `report_id` (integer, optional): specific audit run; defaults to latest",
        "",
        "**Constraints:**",
        "- Read-only access",
        "- Requires a valid property_id associated with a completed crawl",
        "",
        "**Examples:**",
        f"- Get overall health: query `get_report_summary` for property on `{domain}`",
        "- Find slow pages: use `list_pages_slow_response`",
        "- Check AI readiness: use `get_agent_readiness_score` or `get_geo_readiness_score`",
    ]

    # --- Draft agent-permissions.json ---
    permissions_obj = {
        "scope": f"https://{domain}/",
        "allowed_tools": ["read", "crawl"],
        "rate_limits": {"requests_per_minute": 30},
        "notes": "Read-only audit access. Respect robots.txt.",
    }

    # --- Detect missing files ---
    missing = []
    agents_status = _fetch_agents_md(domain)
    if not agents_status.get("found"):
        missing.append("AGENTS.md")
    llms_status = _fetch_llms_txt(domain)
    if not llms_status.get("found"):
        missing.append("llms.txt")
    skill_status = _fetch_skill_md(domain)
    if not skill_status.get("found"):
        missing.append("skill.md")
    perms_status = _fetch_agent_permissions(domain)
    if not perms_status.get("found"):
        missing.append("agent-permissions.json")

    return {
        "domain": domain,
        "missing_files": missing,
        "agents_md": "\n".join(agents_md_lines),
        "skill_md": "\n".join(l for l in skill_md_lines if l is not None),
        "agent_permissions_json": json.dumps(permissions_obj, indent=2),
        "note": "These are drafts — review and customise before publishing.",
        "provenance": "Generated",
    }
