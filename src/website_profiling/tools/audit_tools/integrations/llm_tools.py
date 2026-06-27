"""LLM and cross-property tool wrappers."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ....db._common import _row_field
from ....db.property_store import list_properties_public
from ....integrations.google.suggest import batch_expand
from ....ai_service_client import generate_content_brief as build_content_brief
from ....ai_service_client import run_page_coach
from .._slice import parse_limit
from ..context import AuditToolContext


def generate_content_brief(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return {"error": "keyword is required"}
    rows: list[dict[str, Any]] = []
    if scoped.property_id is not None:
        kw_data = scoped.load_keywords(conn)
        if isinstance(kw_data, dict):
            all_rows = kw_data.get("rows") or []
            if isinstance(all_rows, list):
                needle = keyword.lower()
                rows = [
                    r for r in all_rows
                    if isinstance(r, dict) and needle in str(r.get("keyword") or "").lower()
                ]
    gaps_raw = args.get("gaps")
    gaps = [str(g) for g in gaps_raw if g] if isinstance(gaps_raw, list) else None
    brief = build_content_brief(keyword, rows, gaps, use_llm=False)
    return {"brief": brief, "keyword": keyword, "matched_rows": len(rows)}


def get_page_coach(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    refresh = str(args.get("refresh") or "").lower() in ("true", "1", "yes")
    result = run_page_coach(
        url,
        refresh=refresh,
        current_id=scoped.report_id,
    )
    return result


def get_portfolio_summary(conn: Connection, _ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    limit = parse_limit(args.get("limit"), 50, 100)
    props = list_properties_public(conn)
    summaries: list[dict[str, Any]] = []
    for prop in props[:limit]:
        if not isinstance(prop, dict):
            continue
        pid = prop.get("id")
        if pid is None:
            continue
        cur = conn.execute(
            """SELECT health_score, generated_at, report_id, issue_counts
               FROM audit_health_snapshots
               WHERE property_id = %s
               ORDER BY generated_at DESC, id DESC
               LIMIT 1""",
            (int(pid),),
        )
        row = cur.fetchone()
        issue_counts = None
        health_score = None
        generated_at = None
        report_id = None
        if row:
            health_score = _row_field(row, "health_score", index=0)
            generated_at = _row_field(row, "generated_at", index=1)
            report_id = _row_field(row, "report_id", index=2)
            raw_counts = _row_field(row, "issue_counts", index=3)
            if isinstance(raw_counts, str):
                try:
                    issue_counts = json.loads(raw_counts)
                except json.JSONDecodeError:
                    issue_counts = {}
            elif isinstance(raw_counts, dict):
                issue_counts = raw_counts
        summaries.append({
            "property_id": pid,
            "name": prop.get("name"),
            "canonical_domain": prop.get("canonical_domain"),
            "health_score": health_score,
            "report_id": report_id,
            "generated_at": generated_at.isoformat() if hasattr(generated_at, "isoformat") else str(generated_at or ""),
            "issue_counts": issue_counts,
        })
    scores = [s["health_score"] for s in summaries if isinstance(s.get("health_score"), (int, float))]
    median = None
    if scores:
        ordered = sorted(scores)
        mid = len(ordered) // 2
        median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
    return {"properties": summaries, "count": len(summaries), "median_health_score": median}


def expand_keywords(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    seeds_raw = args.get("seeds")
    if isinstance(seeds_raw, str):
        seeds = [s.strip() for s in seeds_raw.split(",") if s.strip()]
    elif isinstance(seeds_raw, list):
        seeds = [str(s).strip() for s in seeds_raw if str(s).strip()]
    else:
        return {"error": "seeds is required (list or comma-separated string)"}
    if not seeds:
        return {"error": "seeds is required"}
    seeds = seeds[:30]
    sources_raw = args.get("sources")
    if isinstance(sources_raw, list):
        sources = tuple(str(s).strip() for s in sources_raw if str(s).strip())
    else:
        sources = ("web", "youtube", "questions")
    expanded = batch_expand(seeds, sources=sources, cache_conn=conn)
    return {
        "property_id": scoped.property_id,
        "seeds": seeds,
        "expansions": expanded,
        "seed_count": len(seeds),
    }


def _llm_disabled_response() -> dict[str, Any]:
    from ....llm_config import load_llm_config_from_db, llm_is_enabled

    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"error": "AI insights are disabled — enable LLM in audit settings", "missing": True}
    return {}


def generate_issue_fix(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from ....ai_service_client import generate_issue_fix_suggestion
    from ....llm_config import load_llm_config_from_db

    err = _llm_disabled_response()
    if err:
        return err
    message = str(args.get("message") or "").strip()
    if not message:
        return {"error": "message is required (issue message to fix)"}
    refresh = str(args.get("refresh") or "").lower() in ("true", "1", "yes")
    issue = {
        "message": message,
        "url": args.get("url"),
        "priority": args.get("priority"),
        "category": args.get("category_id") or args.get("category"),
        "recommendation": args.get("recommendation"),
    }
    result = generate_issue_fix_suggestion(issue, cfg=load_llm_config_from_db(), refresh=refresh)
    result["provenance"] = "AI insights"
    return result


def summarize_category_for_client(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from ..issues.issues import get_category_issues

    category_id = str(args.get("category_id") or "").strip()
    if not category_id:
        return {"error": "category_id is required"}
    data = get_category_issues(conn, ctx, {**args, "category_id": category_id})
    if data.get("error"):
        return data
    issues = data.get("issues") or []
    top = issues[:5]
    bullets = [
        f"[{i.get('priority')}] {i.get('message')}" + (f" ({i.get('url')})" if i.get("url") else "")
        for i in top
        if isinstance(i, dict)
    ]
    summary = {
        "category_id": category_id,
        "category_name": data.get("name"),
        "score": data.get("score"),
        "issue_count": len(issues),
        "headline": f"{data.get('name') or category_id}: {len(issues)} issue(s), score {data.get('score')}",
        "top_issues": bullets,
    }
    err = _llm_disabled_response()
    if not err:
        from ....ai_service_client import complete_json, parse_json_response

        try:
            user = (
                "Write a 2-3 sentence client-friendly summary of this audit category. "
                f"Return JSON with key summary. Data: {json.dumps(summary, default=str)[:3000]}"
            )
            raw = complete_json("You are a technical SEO consultant writing for clients.", user)
            if isinstance(raw, dict) and raw.get("summary"):
                summary["narrative"] = raw["summary"]
            else:
                summary["narrative"] = str(raw.get("summary") or parse_json_response(str(raw)).get("summary") or "")
        except Exception as e:
            summary["narrative_error"] = str(e)
    summary["provenance"] = "AI insights" if summary.get("narrative") else "Crawl"
    return summary


def prioritize_fix_roadmap(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from ....reporting.issue_impact import sort_issues_by_impact
    from ..report.report import _iter_category_issues

    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "roadmap": []}
    issues = sort_issues_by_impact(_iter_category_issues(payload))
    try:
        top_n = int(args.get("limit", 15))
    except (TypeError, ValueError):
        top_n = 15
    top_n = max(1, min(top_n, 30))
    roadmap = [
        {
            "rank": i + 1,
            "priority": iss.get("priority"),
            "impact_score": iss.get("impact_score"),
            "message": iss.get("message"),
            "url": iss.get("url"),
            "category": iss.get("category"),
            "gsc_clicks": iss.get("gsc_clicks"),
            "ga4_sessions": iss.get("ga4_sessions"),
        }
        for i, iss in enumerate(issues[:top_n])
    ]
    return {"roadmap": roadmap, "total_issues": len(issues), "provenance": "Crawl"}


def analyze_serp_snippet_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from ....integrations.google.page_lookup import slice_from_google_row

    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    data = scoped.load_google(conn)
    gsc_slice = slice_from_google_row(data, url) if data else {}
    scoped_df = scoped.load_crawl_df(conn)
    page_row: dict[str, Any] = {}
    if scoped_df is not None and not scoped_df.empty:
        needle = url.lower()
        for _, row in scoped_df.iterrows():
            if str(row.get("url") or "").lower() == needle:
                page_row = row.to_dict()
                break
    base = {
        "url": url,
        "current_title": page_row.get("title"),
        "current_meta_description": page_row.get("meta_description"),
        "gsc_queries": (gsc_slice.get("gsc") or {}).get("queries") if isinstance(gsc_slice, dict) else None,
        "gsc_metrics": (gsc_slice.get("gsc") or {}).get("page_metrics") if isinstance(gsc_slice, dict) else None,
    }
    err = _llm_disabled_response()
    if err:
        base["note"] = err.get("error")
        base["provenance"] = "Crawl"
        return base
    from ....ai_service_client import complete_json

    prompt = (
        "Suggest improved title and meta description for better CTR. "
        f"Context: {json.dumps(base, default=str)[:2500]}"
    )
    try:
        suggestions = complete_json(
            "You are an SEO copywriter. Return JSON with title, meta_description, rationale.",
            prompt,
        )
        base["suggestions"] = suggestions if isinstance(suggestions, dict) else {}
        base["provenance"] = "AI insights"
    except Exception as e:
        base["error"] = str(e)
        base["provenance"] = "Crawl"
    return base


def draft_llms_txt(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    site_name = str(payload.get("site_name") or scoped.resolve_property_domain(conn) or "Site")
    top_pages = (payload.get("top_pages") or payload.get("links") or [])[:10]
    page_urls = [str(p.get("url")) for p in top_pages if isinstance(p, dict) and p.get("url")]
    schema_cov = payload.get("schema_coverage") if isinstance(payload.get("schema_coverage"), dict) else {}
    draft_lines = [
        f"# {site_name}",
        "",
        "> LLM-oriented site index (draft — review before publishing)",
        "",
        "## Key pages",
        *[f"- {u}" for u in page_urls],
        "",
        f"## Schema coverage: {schema_cov.get('pages_with_schema', 'n/a')} pages with structured data",
    ]
    err = _llm_disabled_response()
    if not err:
        from ....ai_service_client import complete_json

        try:
            raw = complete_json(
                "You write concise llms.txt files per emerging conventions. Return JSON with key content.",
                "Polish this llms.txt draft:\n" + "\n".join(draft_lines),
            )
            content = raw.get("content") if isinstance(raw, dict) else None
            if content and str(content).strip():
                draft_lines = str(content).strip().splitlines()
        except Exception:
            pass
    return {
        "site_name": site_name,
        "llms_txt_draft": "\n".join(draft_lines),
        "provenance": "AI insights",
    }


def generate_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate JSON-LD schema markup (FAQPage / Organization / Article / WebSite) from crawl data."""
    scoped = ctx.with_args(args)
    schema_type = str(args.get("schema_type") or "WebSite").strip()
    url = str(args.get("url") or "").strip()
    payload = scoped.load_payload(conn)
    domain = str(scoped.resolve_property_domain(conn) or "")
    site_name = str(payload.get("site_name") or domain or "Site")
    from ..geo.geo_tools import _base_url as _mk_base
    base_url = _mk_base(domain) if domain else url

    def _website_schema() -> dict[str, Any]:
        return {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": site_name,
            "url": base_url,
            "description": f"{site_name} — official website",
            "potentialAction": {
                "@type": "SearchAction",
                "target": {"@type": "EntryPoint", "urlTemplate": f"{base_url}/?s={{search_term_string}}"},
                "query-input": "required name=search_term_string",
            },
        }

    def _organization_schema() -> dict[str, Any]:
        return {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": site_name,
            "url": base_url,
            "logo": {"@type": "ImageObject", "url": f"{base_url}/logo.png"},
            "sameAs": [],
        }

    def _faqpage_schema() -> dict[str, Any]:
        df = scoped.load_crawl_df(conn)
        questions: list[dict[str, Any]] = []
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rec = row.to_dict()
                title = str(rec.get("title") or "")
                excerpt = str(rec.get("content_excerpt") or "")
                if "?" in title or "faq" in str(rec.get("url") or "").lower():
                    questions.append({
                        "@type": "Question",
                        "name": title,
                        "acceptedAnswer": {"@type": "Answer", "text": excerpt[:300] or "See full answer on the page."},
                    })
                if len(questions) >= 10:
                    break
        return {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": questions or [
                {"@type": "Question", "name": "Example question?",
                 "acceptedAnswer": {"@type": "Answer", "text": "Example answer."}}
            ],
        }

    def _article_schema() -> dict[str, Any]:
        df = scoped.load_crawl_df(conn)
        headline, description = "", ""
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rec = row.to_dict()
                if str(rec.get("url") or "").lower() == url.lower():
                    headline = str(rec.get("title") or "")
                    description = str(rec.get("meta_description") or rec.get("content_excerpt") or "")[:200]
                    break
        return {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": headline or "Article title",
            "description": description or "Article description",
            "url": url or base_url,
            "publisher": {
                "@type": "Organization",
                "name": site_name,
                "url": base_url,
            },
        }

    generators = {
        "WebSite": _website_schema,
        "Organization": _organization_schema,
        "FAQPage": _faqpage_schema,
        "Article": _article_schema,
    }
    schema_type_clean = schema_type if schema_type in generators else "WebSite"
    schema_obj = generators[schema_type_clean]()

    err = _llm_disabled_response()
    if not err:
        from ....ai_service_client import complete_json

        try:
            raw = complete_json(
                "You generate valid JSON-LD schema.org markup. Return JSON with key schema_json.",
                f"Improve this {schema_type_clean} JSON-LD for AI readability:\n{json.dumps(schema_obj, indent=2)[:1500]}",
            )
            improved = raw.get("schema_json") if isinstance(raw, dict) else None
            if isinstance(improved, dict) and improved:
                schema_obj = improved
        except Exception:
            pass

    return {
        "schema_type": schema_type_clean,
        "schema_json": schema_obj,
        "script_tag": f'<script type="application/ld+json">\n{json.dumps(schema_obj, indent=2)}\n</script>',
        "provenance": "AI insights" if not err else "Generated",
    }


def generate_robots_txt(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate a robots.txt that explicitly allows all major AI citation bots."""
    from ..geo.geo_list_tools import _AI_BOT_TIERS

    scoped = ctx.with_args(args)
    domain = str(scoped.resolve_property_domain(conn) or "")
    from ..geo.geo_tools import _base_url as _mk_base
    base_url = _mk_base(domain) if domain else ""

    lines = ["# robots.txt — generated by Site Audit", ""]
    for agent in _AI_BOT_TIERS:
        lines.append(f"User-agent: {agent}")
        lines.append("Allow: /")
        lines.append("")
    lines += ["User-agent: *", "Allow: /", ""]
    if base_url:
        lines.append(f"Sitemap: {base_url}/sitemap.xml")

    return {
        "domain": domain,
        "robots_txt": "\n".join(lines),
        "ai_bots_allowed": list(_AI_BOT_TIERS.keys()),
        "provenance": "Generated",
    }


def generate_meta_tags(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate meta/OG tag recommendations for a URL based on crawl data."""
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "url": url}
    needle = url.lower()
    for _, row in df.iterrows():
        rec = row.to_dict()
        if str(rec.get("url") or "").lower() != needle:
            continue
        title = str(rec.get("title") or "")
        desc = str(rec.get("meta_description") or rec.get("content_excerpt") or "")[:160]
        canonical = url
        og_title = title
        og_desc = desc
        tags: list[str] = [
            f'<title>{title or "Page Title"}</title>',
            f'<meta name="description" content="{desc or "Page description."}">',
            f'<link rel="canonical" href="{canonical}">',
            f'<meta property="og:title" content="{og_title or title}">',
            f'<meta property="og:description" content="{og_desc or desc}">',
            f'<meta property="og:url" content="{url}">',
            '<meta property="og:type" content="website">',
        ]
        return {
            "url": url,
            "meta_tags_html": "\n".join(tags),
            "title": title,
            "meta_description": desc,
            "provenance": "Generated",
        }
    return {"error": "url not found in crawl", "url": url}


def generate_geo_fix_bundle(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate all missing GEO fix files: llms.txt, robots.txt, WebSite schema, and meta tags summary."""
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)

    llms_result = draft_llms_txt(conn, scoped, args)
    robots_result = generate_robots_txt(conn, scoped, args)
    schema_result = generate_schema(conn, scoped, {**args, "schema_type": "WebSite"})
    org_schema_result = generate_schema(conn, scoped, {**args, "schema_type": "Organization"})

    from concurrent.futures import ThreadPoolExecutor, as_completed
    from ..geo.geo_tools import _fetch_llms_txt, _fetch_ai_discovery, _score_meta_signals
    from ..geo.geo_list_tools import _parse_robots_txt, _parse_robots_access

    with ThreadPoolExecutor(max_workers=3) as _pool:
        _f_llms = _pool.submit(_fetch_llms_txt, domain)
        _f_disc = _pool.submit(_fetch_ai_discovery, domain)
        _f_meta = _pool.submit(_score_meta_signals, domain)
        llms_status = _f_llms.result()
        discovery_status = _f_disc.result()
        meta_status = _f_meta.result()

    missing_files: list[str] = []
    if not llms_status.get("found"):
        missing_files.append("llms.txt")
    robots_text = _parse_robots_txt(domain)
    access_map = _parse_robots_access(robots_text) if robots_text else {}
    from ..geo.geo_list_tools import _AI_BOT_TIERS
    citation_bots = [b for b, t in _AI_BOT_TIERS.items() if t == "citation"]
    if any(access_map.get(b.lower()) == "blocked" for b in citation_bots):
        missing_files.append("robots.txt (AI bots blocked)")
    if not discovery_status.get("endpoints", {}).get("ai_txt", {}).get("found"):
        missing_files.append(".well-known/ai.txt")
    if not meta_status.get("has_meta_description"):
        missing_files.append("meta description tags")

    return {
        "domain": domain,
        "missing_files": missing_files,
        "llms_txt": llms_result,
        "robots_txt": robots_result,
        "website_schema": schema_result,
        "organization_schema": org_schema_result,
        "provenance": "Generated",
    }
