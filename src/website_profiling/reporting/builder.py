"""
Generate report data from crawl and write to SQLite. UI is the React app in UI/ (loads report.db).
"""
import json
import os
import socket
import ssl
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from tqdm.auto import tqdm

from ..common import (
    LINK_COLUMN_NAMES,
    load_dataframe,
    load_edges,
    normalize_link,
    parse_links_serialized,
    save_edges,
)
from ..config import get_bool
from ..ml.enrich import cluster_keywords_semantic, run_ml_enrichment
from .categories import build_categories
from ..security_scanner import run_security_scan

# SEO thresholds for recommendations
TITLE_LEN_MIN = 30
TITLE_LEN_MAX = 60
META_DESC_LEN_MIN = 70
META_DESC_LEN_MAX = 160
THIN_CONTENT_CHARS = 300


def fetch_site_ssl_expires_iso(hostname: str, timeout: float = 5.0) -> Optional[str]:
    """Return certificate notAfter as ISO 8601 UTC, or None on failure."""
    host = (hostname or "").strip().lower()
    if not host:
        return None
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        if not cert:
            return None
        na = cert.get("notAfter")
        if not na:
            return None
        ts = ssl.cert_time_to_seconds(na)
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def build_lighthouse_by_url_for_report(conn: Any) -> dict[str, Any]:
    """
    Merge per-URL Lighthouse page summaries with latest lighthouse_runs row: full audits/items
    from normalized tables, uncapped top_failures and diagnostics from stored LHR JSON.
    """
    from ..db import (
        read_lh_audits_with_items,
        read_lh_runs_by_url,
        read_lighthouse_page_summaries,
        read_lighthouse_run_json,
    )
    from ..lighthouse.runner import _evidence_from_audit, extract_from_lighthouse_json
    from ..tools.warnings import parse_lighthouse_to_diagnostics, resolve_impact

    summaries = read_lighthouse_page_summaries(conn)
    runs_map = read_lh_runs_by_url(conn)

    summaries_norm: dict[str, Any] = {}
    for k, v in summaries.items():
        nk = str(k).strip().rstrip("/")
        summaries_norm[nk] = v

    all_urls = set(summaries_norm.keys()) | set(runs_map.keys())
    out: dict[str, Any] = {}

    for u in sorted(all_urls):
        base: dict[str, Any] = dict(summaries_norm[u]) if u in summaries_norm else {}
        run_ids = runs_map.get(u, [])
        run_id = run_ids[-1] if run_ids else None

        if run_id is not None:
            raw = read_lighthouse_run_json(conn, run_id)
            if not base and raw:
                ex = extract_from_lighthouse_json(raw)
                lr = raw.get("lighthouseResult") or raw
                final_u = lr.get("finalUrl") or lr.get("requestedUrl") or u
                base = {
                    "url": str(final_u).strip().rstrip("/"),
                    "median_metrics": {
                        "lcp_ms": ex.get("lcp_ms"),
                        "cls": ex.get("cls"),
                        "tbt_ms": ex.get("tbt_ms"),
                        "fcp_ms": ex.get("fcp_ms"),
                        "speed_index_ms": ex.get("speed_index_ms"),
                        "performance_score": ex.get("performance_score"),
                        "accessibility_score": ex.get("accessibility_score"),
                        "seo_score": ex.get("seo_score"),
                        "best_practices_score": ex.get("best_practices_score"),
                        "pwa_score": ex.get("pwa_score"),
                    },
                    "category_scores": dict(ex.get("category_scores") or {}),
                    "strategy": "mobile",
                    "device": "mobile",
                    "mode": "navigation",
                }
            base["audits"] = read_lh_audits_with_items(conn, run_id)
            if raw:
                lr = raw.get("lighthouseResult") or raw
                audits_map = lr.get("audits") or {}
                failures: list[dict[str, Any]] = []
                for aid, a in audits_map.items():
                    if not isinstance(a, dict):
                        continue
                    score = a.get("score")
                    if score is None or score >= 1:
                        continue
                    title = a.get("title") or aid
                    help_text = a.get("helpText") or ""
                    failures.append(
                        {
                            "id": aid,
                            "score": score,
                            "helpText": help_text,
                            "impact": resolve_impact(aid, title, help_text),
                            "evidence": _evidence_from_audit(a),
                        }
                    )
                failures.sort(key=lambda x: (x["score"] or 0))
                base["top_failures"] = failures
                base["diagnostics"] = parse_lighthouse_to_diagnostics(raw, max_nodes_in_refs=None)
        elif not base:
            continue

        if not base.get("url"):
            base["url"] = u
        out[u] = base

    return out


def lighthouse_for_url(lighthouse_by_url: dict[str, Any], url: str) -> Optional[dict[str, Any]]:
    """Resolve Lighthouse summary for a crawled URL (trailing-slash tolerant)."""
    if not lighthouse_by_url or not url:
        return None
    u = str(url).strip().rstrip("/")
    if u in lighthouse_by_url:
        return lighthouse_by_url[u]
    for k, v in lighthouse_by_url.items():
        if str(k).strip().rstrip("/") == u:
            return v
    return None


def build_edges_from_df(
    df: pd.DataFrame,
    edges_csv: str,
    same_domain_only: bool,
    max_fetch_for_edges: int,
    concurrency: int,
    timeout: int,
    polite_delay: float,
) -> list[tuple[str, str]]:
    """Build or load edges; return list of (from, to) tuples."""
    edges = load_edges(edges_csv)
    if edges:
        return edges

    # Prefer columns that hold URL lists (e.g. outlink_targets); skip "outlinks" (numeric count)
    candidate_cols = [
        c for c in df.columns
        if c.lower() in LINK_COLUMN_NAMES and c.lower() != "outlinks"
    ]
    if candidate_cols:
        for col in candidate_cols:
            if df[col].notna().sum() == 0:
                continue
            for src, raw in zip(df["url"], df[col].fillna("")):
                for t in parse_links_serialized(raw):
                    if not t:
                        continue
                    if same_domain_only and urlparse(src).netloc != urlparse(t).netloc:
                        continue
                    edges.append((src, t))
            if edges:
                return edges

    session = requests.Session()
    session.headers.update({"User-Agent": "WebsiteProfiling/1.0"})
    urls = df["url"].tolist()[:max_fetch_for_edges]

    def fetch(src):
        try:
            r = session.get(src, timeout=timeout, allow_redirects=True)
            if r.status_code != 200 or not r.headers.get("Content-Type", "").lower().startswith("text/html"):
                return []
            soup = BeautifulSoup(r.text, "lxml")
            out = set()
            for a in soup.find_all("a", href=True):
                ln = normalize_link(src, a["href"])
                if not ln or (same_domain_only and urlparse(src).netloc != urlparse(ln).netloc):
                    continue
                out.add(ln)
            if polite_delay:
                time.sleep(polite_delay)
            return list(out)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = {ex.submit(fetch, u): u for u in urls}
        for f in tqdm(as_completed(futures), total=len(futures), desc="Extracting links"):
            src = futures[f]
            try:
                outs = f.result()
            except Exception:
                outs = []
            for t in outs:
                edges.append((src, t))
    return edges


def _fetch_site_level(start_url: str, timeout: int = 8) -> dict:
    """Fetch robots.txt and sitemap.xml from start_url origin. Return site_level dict."""
    parsed = urlparse(start_url)
    if not parsed.scheme or not parsed.netloc:
        return {"robots_present": False, "sitemap_present": False, "sitemap_valid": False}
    base = f"{parsed.scheme}://{parsed.netloc}"
    session = requests.Session()
    session.headers.update({"User-Agent": "WebsiteProfiling/1.0"})
    out = {"robots_present": False, "sitemap_present": False, "sitemap_valid": False}
    try:
        r = session.get(f"{base}/robots.txt", timeout=timeout)
        if r.status_code == 200 and r.text:
            out["robots_present"] = True
            # Optional: parse robots for sitemap URL
            for line in r.text.splitlines():
                line = line.strip()
                if line.lower().startswith("sitemap:"):
                    break
    except Exception:
        pass
    try:
        r = session.get(f"{base}/sitemap.xml", timeout=timeout)
        if r.status_code == 200 and r.text:
            out["sitemap_present"] = True
            # Basic XML check
            out["sitemap_valid"] = "<" in r.text and ">" in r.text and ("urlset" in r.text or "sitemapindex" in r.text)
    except Exception:
        pass
    return out


def _compute_summary_seo_issues(df: pd.DataFrame) -> dict:
    """Compute crawl summary, SEO health metrics, issues list, and recommendations from crawl DataFrame."""
    total = len(df)
    status_str = df["status"].astype(str) if "status" in df.columns else pd.Series(["unknown"] * len(df))
    count_2xx = int((status_str.str.match(r"2\d{2}").fillna(False)).sum())
    count_3xx = int((status_str.str.match(r"3\d{2}").fillna(False)).sum())
    count_4xx = int((status_str.str.match(r"4\d{2}").fillna(False)).sum())
    count_5xx = int((status_str.str.match(r"5\d{2}").fillna(False)).sum())
    count_error = int((status_str.isin(["error", "blocked_by_robots"])).sum())
    success_rate = round(100 * count_2xx / total, 1) if total else 0

    outlinks = (
        pd.to_numeric(df["outlinks"], errors="coerce").fillna(0).astype(int)
        if "outlinks" in df.columns
        else pd.Series([0] * len(df))
    )
    title_len = (
        df["title"].fillna("").astype(str).apply(len)
        if "title" in df.columns
        else pd.Series([0] * len(df))
    )
    crawl_time_s = float(df["crawl_time_s"].iloc[0]) if "crawl_time_s" in df.columns and len(df) else None

    summary = {
        "total_urls": total,
        "count_2xx": count_2xx,
        "count_3xx": count_3xx,
        "count_4xx": count_4xx,
        "count_5xx": count_5xx,
        "count_error": count_error,
        "success_rate": success_rate,
        "avg_outlinks": round(float(outlinks.mean()), 1) if total else 0,
        "avg_title_len": round(float(title_len.mean()), 1) if total else 0,
        "crawl_time_s": round(crawl_time_s, 1) if crawl_time_s is not None else None,
    }

    # SEO health (when columns exist)
    seo_health = {}
    if "title" in df.columns:
        titles = df["title"].fillna("").astype(str)
        seo_health["missing_title"] = int((titles.str.len() == 0).sum())
        seo_health["title_short"] = int(((title_len > 0) & (title_len < TITLE_LEN_MIN)).sum())
        seo_health["title_long"] = int((title_len > TITLE_LEN_MAX).sum())
        seo_health["title_ok"] = int(((title_len >= TITLE_LEN_MIN) & (title_len <= TITLE_LEN_MAX)).sum())
    if "meta_description_len" in df.columns:
        md_len = pd.to_numeric(df["meta_description_len"], errors="coerce").fillna(0).astype(int)
        seo_health["missing_meta_desc"] = int((md_len == 0).sum())
        seo_health["meta_desc_short"] = int(((md_len > 0) & (md_len < META_DESC_LEN_MIN)).sum())
        seo_health["meta_desc_long"] = int((md_len > META_DESC_LEN_MAX).sum())
        seo_health["meta_desc_ok"] = int(((md_len >= META_DESC_LEN_MIN) & (md_len <= META_DESC_LEN_MAX)).sum())
    if "h1_count" in df.columns:
        h1c = pd.to_numeric(df["h1_count"], errors="coerce").fillna(-1).astype(int)
        seo_health["h1_zero"] = int((h1c == 0).sum())
        seo_health["h1_one"] = int((h1c == 1).sum())
        seo_health["h1_multi"] = int((h1c > 1).sum())
    if "content_length" in df.columns:
        cl = pd.to_numeric(df["content_length"], errors="coerce").fillna(0).astype(int)
        seo_health["thin_content"] = int(((cl > 0) & (cl < THIN_CONTENT_CHARS)).sum())

    # Issues: broken, redirects, SEO
    issues = {"broken": [], "redirects": [], "seo": []}
    for _, row in df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        u = str(u).strip()
        st = str(row.get("status", "")).strip()
        if st.startswith("4") or st.startswith("5") or st in ("error", "blocked_by_robots"):
            issues["broken"].append({"url": u, "status": st})
        elif st.startswith("3"):
            final = row.get("final_url") or ""
            issues["redirects"].append({"url": u, "status": st, "final_url": str(final) if pd.notna(final) else ""})

    if "title" in df.columns:
        for _, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            t = row.get("title") or ""
            tl = len(str(t).strip())
            if tl == 0:
                issues["seo"].append({"type": "missing_title", "url": u, "message": "Missing title"})
            elif tl < TITLE_LEN_MIN:
                issues["seo"].append({"type": "title_short", "url": u, "message": f"Title too short ({tl} chars)"})
            elif tl > TITLE_LEN_MAX:
                issues["seo"].append({"type": "title_long", "url": u, "message": f"Title too long ({tl} chars)"})
    if "meta_description_len" in df.columns:
        for _, row in df.iterrows():
            md_len = pd.to_numeric(row.get("meta_description_len"), errors="coerce")
            if pd.isna(md_len) or md_len == 0:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            ml = int(md_len)
            if ml < META_DESC_LEN_MIN:
                issues["seo"].append({"type": "meta_desc_short", "url": u, "message": f"Meta description too short ({ml} chars)"})
            elif ml > META_DESC_LEN_MAX:
                issues["seo"].append({"type": "meta_desc_long", "url": u, "message": f"Meta description too long ({ml} chars)"})
    if "h1_count" in df.columns:
        for _, row in df.iterrows():
            h1c = pd.to_numeric(row.get("h1_count"), errors="coerce")
            if pd.isna(h1c) or h1c == 1:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            if int(h1c) == 0:
                issues["seo"].append({"type": "h1_missing", "url": u, "message": "Missing H1"})
            else:
                issues["seo"].append({"type": "h1_multi", "url": u, "message": f"Multiple H1s ({int(h1c)})"})
    if "content_length" in df.columns:
        for _, row in df.iterrows():
            cl = pd.to_numeric(row.get("content_length"), errors="coerce")
            cl = 0 if pd.isna(cl) else int(cl)
            if cl >= THIN_CONTENT_CHARS or cl == 0:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            issues["seo"].append({"type": "thin_content", "url": str(u).strip(), "message": f"Thin content ({int(cl)} chars)"})

    # Recommendations (actionable bullets)
    recommendations = []
    if issues["broken"]:
        recommendations.append(f"Fix {len(issues['broken'])} broken or error URL(s).")
    if issues["redirects"]:
        recommendations.append(f"Review {len(issues['redirects'])} redirect(s); consolidate if possible.")
    if seo_health.get("missing_title", 0) > 0:
        recommendations.append(f"Add titles to {seo_health['missing_title']} page(s).")
    if seo_health.get("title_short", 0) + seo_health.get("title_long", 0) > 0:
        n = seo_health.get("title_short", 0) + seo_health.get("title_long", 0)
        recommendations.append(f"Optimize title length on {n} page(s) (aim 30–60 chars).")
    if seo_health.get("missing_meta_desc", 0) > 0:
        recommendations.append(f"Add meta descriptions to {seo_health['missing_meta_desc']} page(s).")
    if seo_health.get("meta_desc_short", 0) + seo_health.get("meta_desc_long", 0) > 0:
        n = seo_health.get("meta_desc_short", 0) + seo_health.get("meta_desc_long", 0)
        recommendations.append(f"Optimize meta description length on {n} page(s) (aim 70–160 chars).")
    if seo_health.get("h1_zero", 0) > 0:
        recommendations.append(f"Add one H1 per page on {seo_health['h1_zero']} page(s).")
    if seo_health.get("h1_multi", 0) > 0:
        recommendations.append(f"Use a single H1 per page on {seo_health['h1_multi']} page(s).")
    if seo_health.get("thin_content", 0) > 0:
        recommendations.append(f"Expand thin content on {seo_health['thin_content']} page(s) (under {THIN_CONTENT_CHARS} chars).")

    return {
        "summary": summary,
        "seo_health": seo_health,
        "issues": issues,
        "recommendations": recommendations,
    }


def _build_content_analytics(df: pd.DataFrame) -> dict:
    """Build content analytics: word count stats, reading level distribution, content ratio, top keywords."""
    from collections import Counter

    result = {
        "word_count_stats": {"mean": 0, "median": 0, "p25": 0, "p75": 0, "min": 0, "max": 0},
        "word_count_distribution": {},
        "reading_level_distribution": {},
        "content_ratio_distribution": {},
        "top_keywords_site": [],
        "thin_pages": [],
    }
    if "word_count" not in df.columns or df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if success_df.empty:
        return result

    wc = pd.to_numeric(success_df["word_count"], errors="coerce").fillna(0).astype(int)
    result["word_count_stats"] = {
        "mean": round(float(wc.mean()), 1),
        "median": round(float(wc.median()), 1),
        "p25": round(float(wc.quantile(0.25)), 1),
        "p75": round(float(wc.quantile(0.75)), 1),
        "min": int(wc.min()),
        "max": int(wc.max()),
    }

    wc_bins = [(0, 100), (101, 300), (301, 600), (601, 1000), (1001, 2000), (2001, 999999)]
    wc_labels = ["0-100", "101-300", "301-600", "601-1000", "1001-2000", "2001+"]
    result["word_count_distribution"] = {
        lbl: int(((wc >= lo) & (wc <= hi)).sum()) for (lo, hi), lbl in zip(wc_bins, wc_labels)
    }

    if "reading_level" in success_df.columns:
        rl = pd.to_numeric(success_df["reading_level"], errors="coerce").fillna(0)
        rl_bins = [(0, 5), (6, 8), (9, 12), (13, 99)]
        rl_labels = ["Elementary (0-5)", "Middle School (6-8)", "High School (9-12)", "College (13+)"]
        result["reading_level_distribution"] = {
            lbl: int(((rl >= lo) & (rl <= hi)).sum()) for (lo, hi), lbl in zip(rl_bins, rl_labels)
        }

    if "content_html_ratio" in success_df.columns:
        cr = pd.to_numeric(success_df["content_html_ratio"], errors="coerce").fillna(0)
        cr_bins = [(0, 10), (10.01, 20), (20.01, 40), (40.01, 100)]
        cr_labels = ["<10%", "10-20%", "20-40%", ">40%"]
        result["content_ratio_distribution"] = {
            lbl: int(((cr >= lo) & (cr <= hi)).sum()) for (lo, hi), lbl in zip(cr_bins, cr_labels)
        }

    if "top_keywords" in success_df.columns:
        kw_counter = Counter()
        for raw in success_df["top_keywords"].fillna("[]"):
            try:
                items = json.loads(str(raw)) if isinstance(raw, str) else raw
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict):
                            kw_counter[item.get("word", "")] += item.get("count", 0)
            except (json.JSONDecodeError, TypeError):
                pass
        result["top_keywords_site"] = [
            {"word": w, "count": c} for w, c in kw_counter.most_common(30) if w
        ]

    for _, row in success_df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        w = int(pd.to_numeric(row.get("word_count"), errors="coerce") or 0)
        if 0 < w < 300:
            result["thin_pages"].append({"url": str(u).strip(), "word_count": w})

    return result


def _build_social_coverage(df: pd.DataFrame) -> dict:
    """Build social meta coverage stats: OG and Twitter Card presence percentages."""
    result = {
        "og_coverage_pct": 0,
        "twitter_coverage_pct": 0,
        "og_image_coverage_pct": 0,
        "missing_og": [],
        "missing_twitter": [],
        "og_image_missing": [],
    }
    if df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    html_df = success_df
    if "content_type" in success_df.columns:
        html_df = success_df[success_df["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    if html_df.empty:
        return result

    total = len(html_df)

    if "og_title" in html_df.columns:
        has_og = (html_df["og_title"].fillna("").astype(str).str.strip() != "").sum()
        result["og_coverage_pct"] = round(100 * int(has_og) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            og = str(row.get("og_title") or "").strip()
            if not og:
                result["missing_og"].append(u)

    if "twitter_card" in html_df.columns:
        has_tw = (html_df["twitter_card"].fillna("").astype(str).str.strip() != "").sum()
        result["twitter_coverage_pct"] = round(100 * int(has_tw) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            tw = str(row.get("twitter_card") or "").strip()
            if not tw:
                result["missing_twitter"].append(u)

    if "og_image" in html_df.columns:
        has_og_img = (html_df["og_image"].fillna("").astype(str).str.strip() != "").sum()
        result["og_image_coverage_pct"] = round(100 * int(has_og_img) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            img = str(row.get("og_image") or "").strip()
            if not img:
                result["og_image_missing"].append(u)

    result["missing_og"] = result["missing_og"][:100]
    result["missing_twitter"] = result["missing_twitter"][:100]
    result["og_image_missing"] = result["og_image_missing"][:100]
    return result


def _build_tech_stack_summary(df: pd.DataFrame) -> dict:
    """Build tech stack summary: detected technologies with counts and sample URLs."""
    from collections import defaultdict

    result = {"technologies": [], "total_pages_analyzed": 0}
    if "tech_stack" not in df.columns or df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    html_df = success_df
    if "content_type" in success_df.columns:
        html_df = success_df[success_df["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    if html_df.empty:
        return result

    result["total_pages_analyzed"] = len(html_df)
    tech_urls = defaultdict(list)

    for _, row in html_df.iterrows():
        u = str(row.get("url", "")).strip()
        raw = row.get("tech_stack") or "[]"
        try:
            techs = json.loads(str(raw)) if isinstance(raw, str) else raw
            if isinstance(techs, list):
                for t in techs:
                    if isinstance(t, str) and t:
                        tech_urls[t].append(u)
        except (json.JSONDecodeError, TypeError):
            pass

    result["technologies"] = sorted(
        [{"name": name, "count": len(urls), "sample_urls": urls[:3]} for name, urls in tech_urls.items()],
        key=lambda x: x["count"],
        reverse=True,
    )
    return result


def _build_response_time_stats(df: pd.DataFrame) -> dict:
    """Build response time statistics and distribution."""
    result = {
        "p25": 0, "p50": 0, "p75": 0, "p95": 0, "p99": 0,
        "slow_pages": [],
        "distribution": {},
    }
    if "response_time_ms" not in df.columns or df.empty:
        return result

    rt = pd.to_numeric(df["response_time_ms"], errors="coerce").dropna()
    if rt.empty:
        return result

    result["p25"] = round(float(rt.quantile(0.25)), 0)
    result["p50"] = round(float(rt.quantile(0.50)), 0)
    result["p75"] = round(float(rt.quantile(0.75)), 0)
    result["p95"] = round(float(rt.quantile(0.95)), 0)
    result["p99"] = round(float(rt.quantile(0.99)), 0)

    rt_bins = [(0, 200), (200, 500), (500, 1000), (1000, 2000), (2000, 999999)]
    rt_labels = ["<200ms", "200-500ms", "500ms-1s", "1-2s", ">2s"]
    rt_full = pd.to_numeric(df["response_time_ms"], errors="coerce").fillna(0)
    result["distribution"] = {
        lbl: int(((rt_full >= lo) & (rt_full < hi)).sum()) for (lo, hi), lbl in zip(rt_bins, rt_labels)
    }

    for _, row in df.iterrows():
        u = row.get("url")
        ms = pd.to_numeric(row.get("response_time_ms"), errors="coerce")
        if pd.isna(u) or pd.isna(ms) or ms <= 2000:
            continue
        result["slow_pages"].append({"url": str(u).strip(), "response_time_ms": int(ms)})
    result["slow_pages"] = sorted(result["slow_pages"], key=lambda x: x["response_time_ms"], reverse=True)[:50]
    return result


def _build_depth_distribution(df: pd.DataFrame) -> dict:
    """Build crawl depth distribution."""
    result = {"by_depth": {}, "max_depth": 0, "avg_depth": 0}
    if "depth" not in df.columns or df.empty:
        return result

    depths = pd.to_numeric(df["depth"], errors="coerce").dropna().astype(int)
    if depths.empty:
        return result

    result["max_depth"] = int(depths.max())
    result["avg_depth"] = round(float(depths.mean()), 1)
    counts = depths.value_counts().sort_index()
    result["by_depth"] = {str(int(k)): int(v) for k, v in counts.items()}
    return result


def run_simple_report(
    crawl_csv: str,
    edges_csv: str = "edges.csv",
    output_html: str = "site_report.html",
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
    security_findings_output: Optional[str] = None,
    lighthouse_summary_path: Optional[str] = None,
    db_path: Optional[str] = None,
    config: Optional[dict[str, str]] = None,
) -> str:
    """Load crawl data, build edges if needed, write report payload to SQLite. Returns db_path. Requires db_path (React app in UI/ loads report.db)."""
    run_id = None
    crawl_run_created_at: Optional[str] = None
    if db_path:
        from ..db import (
            db_session,
            get_crawl_run_info,
            get_latest_crawl_run_id,
            init_schema,
            read_crawl,
            read_edges,
            read_lighthouse_summary,
            write_edges,
        )
        print("  Loading crawl data from DB...", flush=True)
        with db_session(db_path) as conn:
            init_schema(conn)
            run_id = get_latest_crawl_run_id(conn)
            if run_id is not None:
                info = get_crawl_run_info(conn, run_id)
                crawl_run_created_at = info["created_at"] if info else None
            df = read_crawl(conn, run_id)
            edges = read_edges(conn, run_id)
            lighthouse_summary = read_lighthouse_summary(conn)
            lighthouse_by_url = build_lighthouse_by_url_for_report(conn)
            if not lighthouse_summary and lighthouse_by_url:
                first_url = next(iter(lighthouse_by_url), None)
                if first_url is not None:
                    lighthouse_summary = lighthouse_by_url[first_url]
            print(f"  Loaded {len(df)} URLs, {len(edges)} edges.", flush=True)
            if df.empty and not edges:
                raise FileNotFoundError(f"No crawl or edges data in DB: {db_path}")
    else:
        if not os.path.exists(crawl_csv):
            raise FileNotFoundError(f"Crawl data not found: {crawl_csv}")
        print("  Loading crawl data from file...", flush=True)
        df = load_dataframe(crawl_csv)
        edges = []
        lighthouse_summary = None
        lighthouse_by_url = {}
        print(f"  Loaded {len(df)} URLs.", flush=True)

    if "url" not in df.columns and not df.empty:
        raise ValueError("Crawl DataFrame missing required column 'url'")

    df = df.copy()
    if not df.empty:
        df["url"] = df["url"].astype(str).str.rstrip("/")

    site_display = (site_name or "").strip() or (urlparse(start_url or "").netloc if start_url else "") or "Site"
    report_display_title = (report_title or "").strip() or f"{site_display} — Crawl Report"

    if not edges and not df.empty:
        print("  Building edges from crawl data...", flush=True)
        edges = build_edges_from_df(
            df, edges_csv, same_domain_only, max_fetch_for_edges, concurrency, timeout, 0.12
        )
        print(f"  Edges: {len(edges)}.", flush=True)
        if edges and db_path:
            with db_session(db_path) as conn:
                write_edges(conn, edges, run_id)
        elif edges and not db_path:
            save_edges(edges, edges_csv)

    # Long report work (ML, graph, network) runs without a DB handle; payload write uses db_session again.

    print("  Computing SEO summary and issues...", flush=True)
    summary_seo = _compute_summary_seo_issues(df)

    print("  Fetching site-level (robots.txt, sitemap)...", flush=True)
    site_level = _fetch_site_level(start_url or "", timeout=8)

    site_ssl_expires_at: Optional[str] = None
    su = (start_url or "").strip()
    if su.lower().startswith("https://"):
        host = urlparse(su).hostname
        if host:
            print("  Checking TLS certificate expiry...", flush=True)
            site_ssl_expires_at = fetch_site_ssl_expires_iso(host)

    security_findings: list = []
    if run_security_scan_flag:
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
        if security_findings_output:
            with open(security_findings_output, "w", encoding="utf-8") as fh:
                json.dump(security_findings, fh, indent=2, default=str)

    print("  ML enrichment (optional)...", flush=True)
    ml_bundle = run_ml_enrichment(df, config)

    print("  Building report categories...", flush=True)
    if not db_path:
        lighthouse_summary = None
        if lighthouse_summary_path and os.path.isfile(lighthouse_summary_path):
            try:
                with open(lighthouse_summary_path, "r", encoding="utf-8") as fh:
                    lighthouse_summary = json.load(fh)
            except (OSError, json.JSONDecodeError):
                pass

    categories = build_categories(
        df, edges, summary_seo, site_level, start_url or "",
        security_findings=security_findings,
        lighthouse_summary=lighthouse_summary,
        ml_bundle=ml_bundle,
    )
    # Ensure categories are JSON-serializable (score may be None)
    for cat in categories:
        if "score" in cat and cat["score"] is not None and hasattr(cat["score"], "item"):
            cat["score"] = int(cat["score"])

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
        # Top pages by PageRank for simple report (top 15)
        rank_rows = [{"url": n, "pagerank": pr.get(n, 0), "degree": deg.get(n, 0)} for n in G.nodes()]
        rank_df = pd.DataFrame(rank_rows).sort_values("pagerank", ascending=False).head(15)
        merge_cols = ["url"] + [c for c in ["title"] if c in df.columns]
        top_pages = rank_df.merge(df[merge_cols].drop_duplicates("url"), on="url", how="left").to_dict(orient="records")
        for r in top_pages:
            r["title"] = r.get("title") or r["url"]
            r["pagerank"] = round(float(r.get("pagerank", 0)), 5)
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

    dup_gid = ml_bundle.get("url_duplicate_group_id") or {}
    sim_map = ml_bundle.get("similar_internal_by_url") or {}
    lang_map = ml_bundle.get("language_by_url") or {}
    spacy_map = ml_bundle.get("spacy_by_url") or {}
    anomalies_list = ml_bundle.get("anomalies") or []
    anomaly_by_url = {str(a.get("url") or "").strip().rstrip("/"): a for a in anomalies_list if a.get("url")}

    # Full links list: every crawled URL with url, status, inlinks, title, content_length, depth
    links = []
    for _, row in df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        u = str(u).strip()
        st = str(row.get("status", "")).strip()
        title_val = row.get("title")
        title_str = "" if pd.isna(title_val) else str(title_val).strip()
        content_len = row.get("content_length")
        if "content_length" in df.columns and content_len is not None and not pd.isna(content_len):
            content_len = int(pd.to_numeric(content_len, errors="coerce") or 0)
        else:
            content_len = 0
        depth_val = row.get("depth") if "depth" in df.columns else None
        depth_int = None
        if depth_val is not None and not pd.isna(depth_val):
            try:
                depth_int = int(pd.to_numeric(depth_val, errors="coerce") or 0)
            except Exception:
                depth_int = None
        wc_val = row.get("word_count") if "word_count" in df.columns else 0
        wc_int = 0
        if wc_val is not None and not pd.isna(wc_val):
            try:
                wc_int = int(pd.to_numeric(wc_val, errors="coerce") or 0)
            except Exception:
                wc_int = 0
        rt_val = row.get("response_time_ms") if "response_time_ms" in df.columns else 0
        rt_int = 0
        if rt_val is not None and not pd.isna(rt_val):
            try:
                rt_int = int(pd.to_numeric(rt_val, errors="coerce") or 0)
            except Exception:
                rt_int = 0
        rec = {
            "url": u,
            "status": st,
            "inlinks": in_degree.get(u, 0),
            "title": title_str,
            "content_length": content_len,
            "word_count": wc_int,
            "response_time_ms": rt_int,
        }
        if depth_int is not None:
            rec["depth"] = depth_int

        def _int_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return 0
            try:
                return int(pd.to_numeric(v, errors="coerce") or 0)
            except Exception:
                return 0

        def _str_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return ""
            return str(v).strip()

        def _bool_col(col):
            v = row.get(col) if col in df.columns else None
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return False
            return bool(v)

        # Navigation / crawl basics
        rec["outlinks"] = _int_col("outlinks")
        rec["content_type"] = _str_col("content_type")
        rec["redirect_chain_length"] = _int_col("redirect_chain_length")

        # SEO signals
        rec["meta_description"] = _str_col("meta_description")
        rec["meta_description_len"] = _int_col("meta_description_len")
        rec["h1"] = _str_col("h1")
        rec["h1_count"] = _int_col("h1_count")
        rec["canonical_url"] = _str_col("canonical_url")
        rec["noindex"] = _bool_col("noindex")
        rec["has_schema"] = _bool_col("has_schema")
        rec["viewport_present"] = _bool_col("viewport_present")
        rec["heading_sequence"] = _str_col("heading_sequence")

        # Images & accessibility
        rec["images_total"] = _int_col("images_total")
        rec["images_without_alt"] = _int_col("images_without_alt")
        rec["img_without_lazy"] = _int_col("img_without_lazy")
        rec["aria_count"] = _int_col("aria_count")
        rec["mixed_content_count"] = _int_col("mixed_content_count")

        # Assets
        rec["script_count"] = _int_col("script_count")
        rec["link_stylesheet_count"] = _int_col("link_stylesheet_count")

        # Caching
        rec["cache_control"] = _str_col("cache_control")
        rec["etag"] = _str_col("etag")

        # Security headers
        rec["strict_transport_security"] = _str_col("strict_transport_security")
        rec["x_content_type_options"] = _str_col("x_content_type_options")
        rec["x_frame_options"] = _str_col("x_frame_options")
        rec["content_security_policy"] = _str_col("content_security_policy")

        # Content analysis
        rec["reading_level"] = round(float(pd.to_numeric(row.get("reading_level") if "reading_level" in df.columns else None, errors="coerce") or 0.0), 1)
        rec["content_html_ratio"] = round(float(pd.to_numeric(row.get("content_html_ratio") if "content_html_ratio" in df.columns else None, errors="coerce") or 0.0), 2)
        rec["top_keywords"] = _str_col("top_keywords")

        # Social / OG
        rec["og_title"] = _str_col("og_title")
        rec["og_description"] = _str_col("og_description")
        rec["og_image"] = _str_col("og_image")
        rec["og_type"] = _str_col("og_type")
        rec["twitter_card"] = _str_col("twitter_card")
        rec["twitter_title"] = _str_col("twitter_title")
        rec["twitter_image"] = _str_col("twitter_image")

        # Tech stack
        rec["tech_stack"] = _str_col("tech_stack")

        pa_obj: dict[str, Any] = {}
        if "page_analysis" in df.columns:
            raw_pa = row.get("page_analysis")
            if raw_pa is not None and not (isinstance(raw_pa, float) and pd.isna(raw_pa)):
                s = str(raw_pa).strip()
                if s and s != "{}":
                    try:
                        pa_obj = json.loads(s)
                    except json.JSONDecodeError:
                        pa_obj = {}
        if not isinstance(pa_obj, dict):
            pa_obj = {}
        rec["page_analysis"] = pa_obj
        rec["internal_link_count"] = int(pa_obj.get("internal_link_count") or 0)
        rec["external_link_count"] = int(pa_obj.get("external_link_count") or 0)

        rec["lighthouse"] = lighthouse_for_url(lighthouse_by_url or {}, u)

        uk = u.rstrip("/")
        if isinstance(rec["page_analysis"], dict):
            if uk in lang_map:
                rec["page_analysis"].setdefault("signals", {})["language"] = lang_map[uk]
            if uk in spacy_map:
                rec["page_analysis"].setdefault("signals", {})["nlp_entities"] = spacy_map[uk]
        if uk in dup_gid:
            rec["duplicate_group_id"] = dup_gid[uk]
        nei = sim_map.get(uk) or sim_map.get(u)
        if nei:
            rec["similar_internal"] = list(nei)
        if uk in lang_map:
            rec["detected_language"] = lang_map[uk]
        if uk in spacy_map:
            rec["nlp_entities"] = spacy_map[uk]
        if uk in anomaly_by_url:
            rec["ml_anomaly"] = anomaly_by_url[uk]

        links.append(rec)

    # Content URL lists for On-Page Content view
    missing_h1 = []
    missing_title = []
    multiple_h1 = []
    if "h1_count" in df.columns:
        h1c = pd.to_numeric(df["h1_count"], errors="coerce").fillna(-1).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            t = row.get("title")
            title_str = "" if pd.isna(t) else str(t).strip()
            if h1c.iloc[i] == 0 or h1c.iloc[i] == -1:
                missing_h1.append({"url": u, "title": title_str})
            elif h1c.iloc[i] > 1:
                multiple_h1.append({"url": u, "h1_count": int(h1c.iloc[i]), "title": title_str})
    if "title" in df.columns:
        titles = df["title"].fillna("").astype(str)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            if titles.iloc[i].strip() == "":
                missing_title.append({"url": u})

    missing_meta_desc = []
    meta_desc_short = []
    meta_desc_long = []
    thin_content = []
    if "meta_description_len" in df.columns:
        md_len = pd.to_numeric(df["meta_description_len"], errors="coerce").fillna(0).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            ml = md_len.iloc[i]
            title_str = "" if pd.isna(row.get("title")) else str(row.get("title")).strip()
            if ml == 0:
                missing_meta_desc.append({"url": u, "title": title_str})
            elif 0 < ml < META_DESC_LEN_MIN:
                meta_desc_short.append({"url": u, "title": title_str, "meta_desc_len": int(ml)})
            elif ml > META_DESC_LEN_MAX:
                meta_desc_long.append({"url": u, "title": title_str, "meta_desc_len": int(ml)})
    if "content_length" in df.columns:
        cl = pd.to_numeric(df["content_length"], errors="coerce").fillna(0).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            c = int(cl.iloc[i])
            if 0 < c < THIN_CONTENT_CHARS:
                title_str = "" if pd.isna(row.get("title")) else str(row.get("title")).strip()
                thin_content.append({"url": u, "title": title_str, "content_length": c})

    content_urls = {
        "missing_h1": missing_h1,
        "missing_title": missing_title,
        "multiple_h1": multiple_h1,
        "missing_meta_desc": missing_meta_desc,
        "meta_desc_short": meta_desc_short,
        "meta_desc_long": meta_desc_long,
        "thin_content": thin_content,
    }

    print("  Building content analytics...", flush=True)
    content_analytics = _build_content_analytics(df)
    semantic_keyword_clusters: list[dict[str, Any]] = []
    if get_bool(config, "enable_semantic_keywords", False):
        try:
            words = [x["word"] for x in (content_analytics.get("top_keywords_site") or []) if x.get("word")]
            semantic_keyword_clusters = cluster_keywords_semantic(words, config)
        except ImportError as e:
            ml_bundle.setdefault("ml_errors", []).append(str(e))
    social_coverage = _build_social_coverage(df)
    tech_stack_summary = _build_tech_stack_summary(df)
    response_time_stats = _build_response_time_stats(df)
    depth_distribution = _build_depth_distribution(df)

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
        "security_findings": security_findings,
        "content_analytics": content_analytics,
        "social_coverage": social_coverage,
        "tech_stack_summary": tech_stack_summary,
        "response_time_stats": response_time_stats,
        "depth_distribution": depth_distribution,
        "content_duplicates": ml_bundle.get("content_duplicates") or [],
        "anomalies": ml_bundle.get("anomalies") or [],
        "language_summary": ml_bundle.get("language_summary") or {},
        "ner_site_summary": ml_bundle.get("ner_site_summary") or {},
        "semantic_keyword_clusters": semantic_keyword_clusters,
        "ml_errors": ml_bundle.get("ml_errors") or [],
    }
    if db_path and run_id is not None:
        report_data["crawl_run_id"] = run_id
        report_data["crawl_run_created_at"] = crawl_run_created_at
    if lighthouse_summary:
        report_data["lighthouse_summary"] = lighthouse_summary
        report_data["lighthouse_diagnostics"] = lighthouse_summary.get("diagnostics") or []
        report_data["lighthouse_human_summary"] = lighthouse_summary.get("human_summary_full") or lighthouse_summary.get("human_summary") or ""
    report_data["lighthouse_by_url"] = lighthouse_by_url
    if db_path:
        print("  Writing report payload to DB...", flush=True)
        from ..db import db_session as _db, init_schema as _init, write_report_payload as db_write_report_payload
        with _db(db_path) as conn:
            _init(conn)
            db_write_report_payload(conn, report_data)
        return db_path
    raise ValueError(
        "Report requires sqlite_db. Set sqlite_db = report.db in your config; "
        "the React app in UI/ loads report.db to display the report."
    )

