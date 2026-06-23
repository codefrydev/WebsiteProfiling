"""
Generate report data from crawl and write to PostgreSQL. The Next.js UI in web/ reads via /api/report/*.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd
import requests

from ..analysis import merge_bundles, run_local_enrichment
from ..analysis.text_hygiene import is_junk_semantic_term
from ..config import get_bool, get_int
from ..llm.enrich import cluster_keywords_llm, run_llm_enrichment
from ..llm_config import load_llm_config_from_db, llm_is_enabled
from ..security_scanner import run_security_scan
from ..scoring import round_half_up
from .categories import build_categories
from .content_analytics import (
    _build_content_analytics,
    _build_depth_distribution,
    _build_image_inventory,
    _build_keyword_opportunities,
    _build_response_time_stats,
    _build_social_coverage,
    _build_tech_stack_summary,
    _build_text_content_analysis,
    _parse_top_keywords_items,
)
from .edges_report import build_edges_from_df
from .lighthouse_report import (
    _derive_expected_host,
    _pick_lighthouse_summary,
    build_lighthouse_by_url_for_report,
    fetch_site_ssl_expires_iso,
    filter_lighthouse_by_host,
    lighthouse_for_url,
)
from .report_metadata import (
    _build_hreflang_summary,
    _build_outbound_link_domains,
    _build_report_metadata,
    _build_url_fingerprints,
    _parse_page_analysis_cell,
    _validate_report_url_counts,
)
from .seo_summary import (
    META_DESC_LEN_MAX,
    META_DESC_LEN_MIN,
    THIN_CONTENT_CHARS,
    TITLE_LEN_MAX,
    TITLE_LEN_MIN,
    _compute_summary_seo_issues,
)
from .site_level import _fetch_site_level
from .builder_sections import build_content_url_lists, build_links_list

# Backward-compatible re-exports for tests and external imports.
__all__ = [
    "run_simple_report",
    "build_edges_from_df",
    "build_lighthouse_by_url_for_report",
    "fetch_site_ssl_expires_iso",
    "filter_lighthouse_by_host",
    "lighthouse_for_url",
    "_fetch_site_level",
    "_compute_summary_seo_issues",
    "_build_content_analytics",
    "_build_text_content_analysis",
    "_build_image_inventory",
    "_build_report_metadata",
]

def run_simple_report(
    max_fetch_for_edges: int = 300,
    concurrency: int = 6,
    timeout: int = 8,
    same_domain_only: bool = True,
    max_nodes_plot: int = 300,
    site_name: Optional[str] = None,
    report_title: Optional[str] = None,
    start_url: Optional[str] = None,
    run_security_scan_flag: bool = True,
    security_scan_active: bool = False,
    security_max_urls_probe: int = 20,
    lighthouse_summary_path: Optional[str] = None,
    config: Optional[dict[str, str]] = None,
    use_database: bool = True,
) -> str:
    """Load crawl data from PostgreSQL, build report payload, write to report_payload."""
    if not use_database:
        raise ValueError("Report requires DATABASE_URL (PostgreSQL). Configure via Docker or local Postgres.")

    from ..db import (
        db_session,
        get_crawl_run_info,
        get_latest_crawl_run_id,
        read_crawl,
        read_edges,
        read_lighthouse_summary,
        write_edges,
    )
    run_id = None
    crawl_run_created_at: Optional[str] = None
    from ..progress import emit_progress

    emit_progress("report", "load_crawl", message="Loading crawl data from DB")
    print("  Loading crawl data from DB...", flush=True)
    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        if run_id is not None:
            info = get_crawl_run_info(conn, run_id)
            crawl_run_created_at = info["created_at"] if info else None
        df = read_crawl(conn, run_id)
        edges = read_edges(conn, run_id)
        global_lighthouse_summary = read_lighthouse_summary(conn)
        lighthouse_by_url = build_lighthouse_by_url_for_report(conn)
        lighthouse_summary = global_lighthouse_summary
        print(f"  Loaded {len(df)} URLs, {len(edges)} edges.", flush=True)
        if df.empty and not edges:
            raise FileNotFoundError("No crawl or edges data in database. Run crawl first.")

    if "url" not in df.columns and not df.empty:
        raise ValueError("Crawl DataFrame missing required column 'url'")

    df = df.copy()
    if not df.empty:
        df["url"] = df["url"].astype(str).str.rstrip("/")

    expected_host = _derive_expected_host(start_url or "", df)
    if lighthouse_by_url and expected_host:
        lighthouse_by_url = filter_lighthouse_by_host(lighthouse_by_url, expected_host)
    lighthouse_summary = _pick_lighthouse_summary(
        lighthouse_by_url,
        start_url or "",
        global_lighthouse_summary,
        expected_host,
    )

    site_display = (site_name or "").strip() or (urlparse(start_url or "").netloc if start_url else "") or "Site"
    report_display_title = (report_title or "").strip() or f"{site_display} — Crawl Report"

    if not edges and not df.empty:
        emit_progress("report", "build_edges", message="Building edges from crawl data")
        print("  Building edges from crawl data...", flush=True)
        render_mode = (str((config or {}).get("crawl_render_mode") or "static")).strip().lower()
        js_concurrency_cfg = get_int(config or {}, "crawl_js_concurrency", 3) or 3
        js_timeout_cfg = get_int(config or {}, "crawl_js_timeout", 30) or 30
        js_wait_until_cfg = (str((config or {}).get("crawl_js_wait_until") or "domcontentloaded")).strip()
        js_extra_wait_ms_cfg = get_int(config or {}, "crawl_js_extra_wait_ms", 1500)
        if js_extra_wait_ms_cfg is None:
            js_extra_wait_ms_cfg = 1500
        js_block_resources_cfg = get_bool(config or {}, "crawl_js_block_resources", True)
        edges = build_edges_from_df(
            df,
            "",
            same_domain_only,
            max_fetch_for_edges,
            concurrency,
            timeout,
            0.12,
            render_mode=render_mode,
            js_timeout=js_timeout_cfg,
            js_concurrency=js_concurrency_cfg,
            js_wait_until=js_wait_until_cfg,
            js_extra_wait_ms=js_extra_wait_ms_cfg,
            js_block_resources=js_block_resources_cfg,
        )
        print(f"  Edges: {len(edges)}.", flush=True)
        if edges:
            with db_session() as conn:
                write_edges(conn, edges, run_id)

    # Long report work (ML, graph, network) runs without a DB handle; payload write uses db_session again.

    emit_progress("report", "seo_summary", message="Computing SEO summary and issues")
    print("  Computing SEO summary and issues...", flush=True)
    summary_seo = _compute_summary_seo_issues(df)

    emit_progress("report", "site_level", message="Fetching site-level data")
    print("  Fetching site-level (robots.txt, sitemap)...", flush=True)
    site_level = _fetch_site_level(start_url or "", timeout=8)

    emit_progress("report", "contact_intelligence", message="Building contact intelligence")
    from .contact_intelligence import build_contact_intelligence

    contact_intelligence = build_contact_intelligence(df, site_level, start_url or "", config)

    site_ssl_expires_at: Optional[str] = None
    su = (start_url or "").strip()
    if su.lower().startswith("https://"):
        host = urlparse(su).hostname
        if host:
            print("  Checking TLS certificate expiry...", flush=True)
            site_ssl_expires_at = fetch_site_ssl_expires_iso(host)

    security_findings: list = []
    if run_security_scan_flag:
        emit_progress("report", "security_scan", message="Running security scan")
        print("  Running security scan...", flush=True)
        security_findings = run_security_scan(
            df,
            start_url=start_url or "",
            run_active=security_scan_active,
            max_urls_to_probe=security_max_urls_probe,
            timeout=timeout,
            polite_delay=0.2,
        )
        print(f"  Security scan: {len(security_findings)} findings.", flush=True)

    emit_progress("report", "content_analysis", message="Content analysis")
    print("  Content analysis (crawl + optional AI insights)...", flush=True)
    local_bundle = run_local_enrichment(df, config)
    llm_cfg = load_llm_config_from_db()
    llm_bundle = run_llm_enrichment(df, llm_cfg) if llm_is_enabled(llm_cfg) else {}
    ml_bundle = merge_bundles(local_bundle, llm_bundle)

    emit_progress("report", "categories", message="Building report categories")
    print("  Building report categories...", flush=True)

    crux_summary: Optional[dict[str, Any]] = None
    if get_bool(config or {}, "enable_crux", False) and start_url:
        try:
            from ..integrations.crux import fetch_crux_origin_metrics

            crux_summary = fetch_crux_origin_metrics(start_url)
        except Exception as e:
            ml_bundle.setdefault("ml_errors", []).append(f"crux: {e}")

    categories = build_categories(
        df, edges, summary_seo, site_level, start_url or "",
        security_findings=security_findings,
        lighthouse_summary=lighthouse_summary,
        ml_bundle=ml_bundle,
        crux_summary=crux_summary,
        lighthouse_by_url=lighthouse_by_url,
    )
    # Ensure categories are JSON-serializable (score may be None)
    for cat in categories:
        if "score" in cat and cat["score"] is not None and hasattr(cat["score"], "item"):
            cat["score"] = int(cat["score"])

    optional_audit_meta: dict[str, Any] = {}
    try:
        from .optional_audits import apply_optional_audits

        optional_audit_meta = apply_optional_audits(categories, df, config)
    except Exception as e:
        ml_bundle.setdefault("ml_errors", []).append(f"optional_audits: {e}")

    df["status_str"] = df["status"].astype(str) if "status" in df.columns else "unknown"
    status_counts = df["status_str"].value_counts().to_dict()
    df["mime"] = (
        df["content_type"].fillna("").apply(
            lambda s: s.split(";")[0].strip() if isinstance(s, str) and s else "unknown"
        )
        if "content_type" in df.columns
        else "unknown"
    )
    top_mimes = df["mime"].value_counts().head(20)
    outlinks = (
        pd.to_numeric(df["outlinks"], errors="coerce").fillna(0).astype(int)
        if "outlinks" in df.columns
        else pd.Series([0] * len(df))
    )
    bins = [0, 1, 2, 3, 6, 11, 21, 51, 999999]
    labels = ["0", "1", "2", "3-5", "6-10", "11-20", "21-50", "51+"]
    counts = [int(((outlinks >= bins[i]) & (outlinks < bins[i + 1])).sum()) for i in range(len(bins) - 1)]
    title_len = (
        df["title"].fillna("").astype(str).apply(len)
        if "title" in df.columns
        else pd.Series([0] * len(df))
    )
    t_bins = [0, 1, 21, 51, 101, 201, 9999]
    t_labels = ["0", "1-20", "21-50", "51-100", "101-200", "200+"]
    t_counts = [
        int(((title_len >= t_bins[i]) & (title_len < t_bins[i + 1])).sum())
        for i in range(len(t_bins) - 1)
    ]
    df["domain"] = df["url"].apply(lambda u: urlparse(u).netloc if pd.notna(u) else "")
    top_domains = df["domain"].value_counts().head(20)
    graph_nodes = []
    graph_edges = []
    top_pages = []
    if edges:
        import networkx as nx
        edf = pd.DataFrame(edges, columns=["from", "to"])
        G = nx.DiGraph()
        G.add_edges_from(edges)
        for u in df["url"].tolist():
            if u not in G:
                G.add_node(u)
        try:
            pr = nx.pagerank(G, alpha=0.85, max_iter=200)
        except Exception:
            pr = {n: 0.0 for n in G.nodes()}
        deg = dict(G.degree())
        nodes = pd.Series(list(edf["from"]) + list(edf["to"])).value_counts().reset_index()
        nodes.columns = ["url", "count"]
        top_nodes = set(nodes.head(max_nodes_plot)["url"].tolist())
        small_edges = edf[edf["from"].isin(top_nodes) & edf["to"].isin(top_nodes)].copy()
        if small_edges.empty:
            small_edges = edf[edf["from"].isin(top_nodes) | edf["to"].isin(top_nodes)].copy()
        graph_nodes = list(top_nodes)
        graph_edges = small_edges.to_dict(orient="records")
        # Top pages by internal link score (PageRank on crawl graph; not Google ranking)
        rank_rows = [{"url": n, "pagerank": pr.get(n, 0), "degree": deg.get(n, 0)} for n in G.nodes()]
        rank_df = pd.DataFrame(rank_rows).sort_values("pagerank", ascending=False).head(15)
        merge_cols = ["url"] + [c for c in ["title"] if c in df.columns]
        top_pages = rank_df.merge(df[merge_cols].drop_duplicates("url"), on="url", how="left").to_dict(orient="records")
        for r in top_pages:
            r["title"] = r.get("title") or r["url"]
            score = round(float(r.get("pagerank", 0)), 5)
            r["pagerank"] = score
            r["internal_link_score"] = score
    else:
        # No edges: top pages by outlinks
        out_ser = pd.to_numeric(df["outlinks"], errors="coerce").fillna(0)
        out_df = df.assign(_out=out_ser).nlargest(15, "_out")
        top_pages = []
        for _, row in out_df.iterrows():
            top_pages.append({
                "url": row["url"],
                "title": row.get("title") or row["url"],
                "outlinks": int(row.get("outlinks", 0) or 0),
                "pagerank": 0.0,
                "degree": int(row.get("outlinks", 0) or 0),
            })

    # In-degree per URL for Link Explorer (number of edges pointing to this url)
    in_degree: dict[str, int] = {}
    for from_url, to_url in edges:
        in_degree[to_url] = in_degree.get(to_url, 0) + 1

    # Full links list: every crawled URL with its SEO/a11y/asset/content signals.
    links = build_links_list(df, in_degree, lighthouse_by_url, ml_bundle)

    # Content URL lists for On-Page Content view
    success_mask = df["status"].astype(str).str.match(r"2\d{2}", na=False) if "status" in df.columns else pd.Series([True] * len(df))
    success_df_urls = df[success_mask] if len(df) else df
    content_urls = build_content_url_lists(df, success_df_urls)

    emit_progress("report", "content_analytics", message="Building content analytics")
    print("  Building content analytics...", flush=True)
    content_analytics = _build_content_analytics(df)
    text_content_analysis = _build_text_content_analysis(df)
    semantic_keyword_clusters: list[dict[str, Any]] = []
    llm_cfg_for_clusters = load_llm_config_from_db()
    if llm_is_enabled(llm_cfg_for_clusters):
        try:
            llm_cfg = llm_cfg_for_clusters
            if str(llm_cfg.get("llm_enable_keyword_clusters", "")).lower() in ("true", "1", "yes"):
                words = [
                    x["word"]
                    for x in (content_analytics.get("top_keywords_site") or [])
                    if x.get("word") and not is_junk_semantic_term(str(x["word"]))
                ]
                semantic_keyword_clusters = cluster_keywords_llm(words, llm_cfg)
        except Exception as e:
            ml_bundle.setdefault("ml_errors", []).append(str(e))
    outbound_max = get_int(config or {}, "outbound_domain_max_rows", 200) or 200
    outbound_link_domains = _build_outbound_link_domains(df, start_url or "", outbound_max)
    hreflang_summary = _build_hreflang_summary(df)
    url_fingerprints = _build_url_fingerprints(df)
    keyword_opportunities = _build_keyword_opportunities(df, config)
    social_coverage = _build_social_coverage(df)
    tech_stack_summary = _build_tech_stack_summary(df)
    response_time_stats = _build_response_time_stats(df)
    depth_distribution = _build_depth_distribution(df)
    image_inventory, image_inventory_summary = _build_image_inventory(links, config)

    hreflang_issue_urls: list[dict[str, Any]] = []
    try:
        from .categories._helpers import _hreflang_issues

        for issue in _hreflang_issues(success_df_urls if len(success_df_urls) else df):
            hreflang_issue_urls.append({
                "url": issue.get("url") or "",
                "message": issue.get("message") or "",
                "priority": issue.get("priority") or "Medium",
            })
    except Exception:
        hreflang_issue_urls = []

    lighthouse_failure_urls: dict[str, list[dict[str, Any]]] = {
        "lcp": [], "inp": [], "cls": [], "seo": [],
    }
    if lighthouse_by_url:
        # Metric buckets keyed by Lighthouse audit id; audit "score" is on the 0-1 scale.
        audit_map = {
            "lcp": "largest-contentful-paint",
            "inp": "interaction-to-next-paint",
            "cls": "cumulative-layout-shift",
        }
        for url, lh in lighthouse_by_url.items():
            if not isinstance(lh, dict):
                continue
            # lh["audits"] is a LIST of audit dicts (see read_lh_audits_with_items),
            # not a dict keyed by id — build the id->audit map ourselves.
            audit_by_id = {
                a.get("id"): a for a in (lh.get("audits") or []) if isinstance(a, dict)
            }
            for bucket, audit_id in audit_map.items():
                audit = audit_by_id.get(audit_id)
                if not isinstance(audit, dict):
                    continue
                score = audit.get("score")
                if score is not None and float(score) < 0.9:
                    lighthouse_failure_urls[bucket].append({
                        "url": str(url),
                        "score": score,
                        "displayValue": audit.get("displayValue"),
                    })
            # "seo" is a Lighthouse category, not an audit id; its score lives in
            # category_scores on the 0-100 scale.
            cat_scores = lh.get("category_scores") if isinstance(lh.get("category_scores"), dict) else {}
            seo_score = cat_scores.get("seo")
            if seo_score is not None:
                norm = float(seo_score) / 100.0 if float(seo_score) > 1 else float(seo_score)
                if norm < 0.9:
                    lighthouse_failure_urls["seo"].append({
                        "url": str(url),
                        "score": seo_score,
                        "displayValue": None,
                    })

    optional_audit_urls: dict[str, list[dict[str, Any]]] = {
        "spell": [], "html": [], "amp": [], "pagination": [],
    }
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            msg = str(issue.get("message") or "").lower()
            rec = {"url": issue.get("url") or "", "message": issue.get("message") or ""}
            if "spell" in msg:
                optional_audit_urls["spell"].append(rec)
            elif "html" in msg and "validation" in msg:
                optional_audit_urls["html"].append(rec)
            elif "amp" in msg:
                optional_audit_urls["amp"].append(rec)
            elif "pagination" in msg or "rel=prev" in msg or "rel=next" in msg:
                optional_audit_urls["pagination"].append(rec)

    report_data = {
        "site_name": site_display,
        "report_title": report_display_title,
        "report_generated_at": datetime.now(timezone.utc).isoformat(),
        "site_ssl_expires_at": site_ssl_expires_at,
        "summary": summary_seo["summary"],
        "seo_health": summary_seo["seo_health"],
        "issues": summary_seo["issues"],
        "recommendations": summary_seo["recommendations"],
        "categories": categories,
        "site_level": site_level,
        "contact_intelligence": contact_intelligence,
        "redirects": summary_seo["issues"].get("redirects", []),
        "orphan_urls": [rec["url"] for rec in links if rec.get("inlinks", 0) == 0],
        "status_counts": status_counts,
        "mime_labels": top_mimes.index.tolist(),
        "mime_values": top_mimes.values.tolist(),
        "outlink_labels": labels,
        "outlink_counts": counts,
        "title_labels": t_labels,
        "title_counts": t_counts,
        "domain_labels": top_domains.index.tolist(),
        "domain_values": top_domains.values.tolist(),
        "graph_nodes": graph_nodes,
        "graph_edges": graph_edges,
        "top_pages": top_pages,
        "links": links,
        "content_urls": content_urls,
        "hreflang_issue_urls": hreflang_issue_urls,
        "lighthouse_failure_urls": lighthouse_failure_urls,
        "optional_audit_urls": optional_audit_urls,
        "security_findings": security_findings,
        "content_analytics": content_analytics,
        "text_content_analysis": text_content_analysis,
        "social_coverage": social_coverage,
        "tech_stack_summary": tech_stack_summary,
        "response_time_stats": response_time_stats,
        "depth_distribution": depth_distribution,
        "image_inventory": image_inventory,
        "image_inventory_summary": image_inventory_summary,
        "content_duplicates": ml_bundle.get("content_duplicates") or [],
        "language_summary": ml_bundle.get("language_summary") or {},
        "ner_site_summary": ml_bundle.get("ner_site_summary") or {},
        "semantic_keyword_clusters": semantic_keyword_clusters,
        "outbound_link_domains": outbound_link_domains,
        "hreflang_summary": hreflang_summary,
        "url_fingerprints": url_fingerprints,
        "keyword_opportunities": keyword_opportunities,
        "ml_errors": ml_bundle.get("ml_errors") or [],
        **optional_audit_meta,
    }
    if get_bool(config or {}, "enable_rich_results_validation", False):
        try:
            from ..integrations.google.rich_results import summarize_rich_results, validate_urls
            from ..config import get_str

            sample_urls = [
                str(l.get("url") or "")
                for l in links
                if isinstance(l, dict) and str(l.get("status") or "").startswith("2")
            ][:20]
            links_by_url = {
                str(l.get("url") or ""): l for l in links if isinstance(l, dict) and l.get("url")
            }
            creds = None
            property_id_rr: Optional[int] = None
            gsc_site = (get_str(config or {}, "gsc_site_url", "") or "").strip() or None
            try:
                from ..db import db_session as _rr_db
                from ..commands.config_resolve import resolve_property_id_from_cfg

                with _rr_db() as conn:
                    property_id_rr = resolve_property_id_from_cfg(config, conn)
            except Exception:
                property_id_rr = None
            if property_id_rr:
                try:
                    from ..integrations.google.auth import build_credentials

                    creds = build_credentials(property_id_rr)
                except Exception:
                    creds = None
            rr_api_key = (get_str(config or {}, "google_rich_results_api_key", "") or "").strip() or None
            rr_rows = validate_urls(
                sample_urls,
                api_key=rr_api_key,
                creds=creds,
                site_url=gsc_site,
                links_by_url=links_by_url,
            )
            report_data["rich_results_validation"] = rr_rows
            report_data["rich_results_meta"] = summarize_rich_results(rr_rows)
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"rich_results: {e}")
    try:
        from ..db import db_session as _ck_db
        from ..commands.config_resolve import resolve_property_id_from_cfg
        from ..integrations.keywords.competitor_gap_store import read_competitor_keyword_gap

        with _ck_db() as conn:
            property_id_ck = resolve_property_id_from_cfg(config, conn)
            if property_id_ck is not None:
                gap_rows = read_competitor_keyword_gap(conn, property_id_ck)
                if gap_rows:
                    report_data["competitor_keyword_gap"] = gap_rows
    except Exception as e:
        report_data.setdefault("ml_errors", []).append(f"competitor_keywords: {e}")
    if run_id is not None:
        report_data["crawl_run_id"] = run_id
        report_data["crawl_run_created_at"] = crawl_run_created_at
    if lighthouse_summary:
        report_data["lighthouse_summary"] = lighthouse_summary
        report_data["lighthouse_diagnostics"] = lighthouse_summary.get("diagnostics") or []
        report_data["lighthouse_human_summary"] = lighthouse_summary.get("human_summary_full") or lighthouse_summary.get("human_summary") or ""
    report_data["lighthouse_by_url"] = lighthouse_by_url
    emit_progress("report", "write_payload", message="Writing report payload to DB")
    print("  Writing report payload to DB...", flush=True)
    from ..db import db_session as _db, write_report_payload as db_write_report_payload
    with _db() as conn:
        google_data: Optional[dict[str, Any]] = None
        kw_data: Optional[dict[str, Any]] = None
        gsc_links: Optional[dict[str, Any]] = None
        property_id: Optional[int] = None
        try:
            from ..commands.config_resolve import resolve_property_id_from_cfg

            property_id = resolve_property_id_from_cfg(config, conn)
        except Exception:
            property_id = None
        try:
            from ..integrations.google.store import read_latest_google_data

            google_data = read_latest_google_data(conn, property_id=property_id)
            if google_data:
                report_data["google"] = google_data
                from .issue_impact import enrich_categories_with_traffic_impact

                enrich_categories_with_traffic_impact(
                    report_data.get("categories") or [],
                    google_data,
                )
        except Exception:
            pass
        try:
            from ..db.crawl_store import read_link_edges
            from .link_edges_report import build_inlink_anchor_matrix, summarize_link_rel

            emit_progress("report", "link_edges", message="Loading crawl link edges")
            if run_id is not None:
                link_edges = read_link_edges(conn, run_id, limit=15000)
                if link_edges:
                    report_data["link_edges"] = link_edges
                    report_data["link_rel_summary"] = summarize_link_rel(link_edges)
                    report_data["inlink_anchor_matrix"] = build_inlink_anchor_matrix(link_edges)
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"link_edges: {e}")
        try:
            from ..integrations.google.keyword_store import read_latest_keyword_data
            from ..integrations.google.gsc_links_store import read_latest_gsc_links_data

            kw_data = read_latest_keyword_data(conn, property_id)
            if kw_data:
                rows = kw_data.get("rows") or []
                if len(rows) > 500:
                    rows = rows[:500]
                    kw_data = {**kw_data, "rows": rows}
                report_data["keywords"] = kw_data
            gsc_links = read_latest_gsc_links_data(conn, property_id)
            if gsc_links:
                report_data["gsc_links"] = gsc_links
            from ..config import get_list
            from ..integrations.google.competitor_links import build_competitor_link_gap

            comp_raw = get_list(config or {}, "competitor_domains", sep=",")
            comp_gap = build_competitor_link_gap(gsc_links, comp_raw)
            if comp_gap:
                report_data["competitor_link_gap"] = comp_gap
        except Exception:
            pass
        try:
            from .indexation import build_indexation_coverage

            gap_limit = get_int(config or {}, "google_url_gap_list_limit", 200) or 200
            indexation_cov = build_indexation_coverage(
                df,
                start_url or "",
                google_data,
                list_limit=gap_limit,
            )
            report_data["indexation_coverage"] = indexation_cov
            from .categories import merge_indexation_issues

            merge_indexation_issues(report_data.get("categories") or [], df, indexation_cov)
            emit_progress("report", "subdomains", message="Building subdomain inventory")
            from .subdomains import build_subdomain_inventory
            from .categories import merge_subdomain_issues

            subdomains_data = build_subdomain_inventory(df, indexation_cov, start_url or "", config)
            report_data["subdomains"] = subdomains_data
            if subdomains_data.get("crtsh_error"):
                report_data.setdefault("ml_errors", []).append(subdomains_data["crtsh_error"])
            merge_subdomain_issues(report_data.get("categories") or [], subdomains_data)
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"indexation: {e}")
        try:
            from .crawl_segments import build_crawl_segments
            from ..config import get_str

            raw = get_str(config or {}, "crawl_path_segments", "") or ""
            prefixes = [p.strip() for p in raw.split(",") if p.strip()]
            if prefixes:
                report_data["crawl_segments"] = build_crawl_segments(
                    df,
                    report_data.get("categories") or [],
                    prefixes,
                )
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"crawl_segments: {e}")
        if crux_summary and crux_summary.get("ok"):
            report_data["crux_summary"] = crux_summary
        try:
            from ..config import get_str
            from ..integrations.bing.webmaster import fetch_bing_backlinks_summary

            bing_key = get_str(config or {}, "bing_webmaster_api_key", "") or ""
            if bing_key and start_url:
                bing_data = fetch_bing_backlinks_summary(bing_key, start_url)
                if bing_data.get("ok"):
                    report_data["bing_backlinks"] = bing_data
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"bing: {e}")
        try:
            from ..llm.issue_fixes import enrich_top_issues_with_llm

            gsc_pages = []
            gsc_block = (report_data.get("google") or {}).get("gsc") or {}
            if isinstance(gsc_block, dict):
                gsc_pages = gsc_block.get("top_pages") or []
            enrich_top_issues_with_llm(
                report_data.get("categories") or [],
                llm_cfg_for_clusters,
                gsc_pages=gsc_pages,
            )
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"issue_fixes: {e}")
        try:
            from ..llm.audit_summary import generate_audit_executive_summary

            report_data["executive_summary"] = generate_audit_executive_summary(report_data, config)
        except Exception:
            pass
        try:
            from ..tools.audit_tools.integrations.llm_tools import get_portfolio_summary
            from ..tools.audit_tools.context import AuditToolContext

            portfolio = get_portfolio_summary(conn, AuditToolContext(property_id=property_id), {})
            scores = []
            for c in report_data.get("categories") or []:
                try:
                    if c.get("score") is not None:
                        scores.append(int(float(c.get("score"))))
                except (TypeError, ValueError):
                    continue
            prop_health = round_half_up(sum(scores) / len(scores)) if scores else None
            prop_count = int(portfolio.get("count") or 0)
            median = portfolio.get("median_health_score")
            bench: dict[str, Any] = {
                "median_health_score": median,
                "property_health_score": prop_health,
                "property_count": prop_count,
            }
            if prop_count <= 1:
                bench["status"] = "single_property"
                bench["message"] = "Add more properties to compare portfolio median."
            elif median is None:
                bench["status"] = "unavailable"
                bench["message"] = "No health snapshots yet for portfolio comparison."
            else:
                bench["status"] = "ok"
            report_data["portfolio_benchmark"] = bench
            print(
                f"  Portfolio benchmark: property={prop_health}, median={median}, count={prop_count}",
                flush=True,
            )
        except Exception as e:
            report_data.setdefault("ml_errors", []).append(f"portfolio_benchmark: {e}")
            report_data["portfolio_benchmark"] = {
                "status": "error",
                "message": str(e),
                "property_health_score": None,
                "median_health_score": None,
                "property_count": 0,
            }
        report_data["report_meta"] = _build_report_metadata(
            df,
            config,
            lighthouse_summary,
            google_data,
            kw_data,
            ml_bundle,
            run_id,
            crawl_run_created_at,
            gsc_links,
        )
        _validate_report_url_counts(report_data, len(df))
        db_write_report_payload(conn, report_data)
    return "postgresql"

