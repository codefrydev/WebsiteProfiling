"""
Generate report data from crawl and write to SQLite. UI is the React app in UI/ (loads report.db).
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from urllib.parse import urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from tqdm.auto import tqdm

from .common import (
    LINK_COLUMN_NAMES,
    load_dataframe,
    load_edges,
    normalize_link,
    parse_links_serialized,
    save_edges,
)
from .report_categories import build_categories
from .security_scanner import run_security_scan

# SEO thresholds for recommendations
TITLE_LEN_MIN = 30
TITLE_LEN_MAX = 60
META_DESC_LEN_MIN = 70
META_DESC_LEN_MAX = 160
THIN_CONTENT_CHARS = 300


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
) -> str:
    """Load crawl data, build edges if needed, write report payload to SQLite. Returns db_path. Requires db_path (React app in UI/ loads report.db)."""
    conn = None
    run_id = None
    if db_path:
        from .db import (
            get_connection,
            get_crawl_run_info,
            get_latest_crawl_run_id,
            init_schema,
            read_crawl,
            read_edges,
            read_lighthouse_page_summaries,
            read_lighthouse_summary,
            write_edges,
            write_report_payload,
        )
        print("  Loading crawl data from DB...", flush=True)
        conn = get_connection(db_path)
        init_schema(conn)
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
        edges = read_edges(conn, run_id)
        lighthouse_summary = read_lighthouse_summary(conn)
        lighthouse_by_url = read_lighthouse_page_summaries(conn)
        if not lighthouse_summary and lighthouse_by_url:
            first_url = next(iter(lighthouse_by_url), None)
            if first_url is not None:
                lighthouse_summary = lighthouse_by_url[first_url]
        print(f"  Loaded {len(df)} URLs, {len(edges)} edges.", flush=True)
        if df.empty and not edges:
            conn.close()
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
        if conn:
            conn.close()
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
        if edges and db_path and conn:
            write_edges(conn, edges, run_id)
        elif edges and not db_path:
            save_edges(edges, edges_csv)

    print("  Computing SEO summary and issues...", flush=True)
    summary_seo = _compute_summary_seo_issues(df)

    print("  Fetching site-level (robots.txt, sitemap)...", flush=True)
    site_level = _fetch_site_level(start_url or "", timeout=8)

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
        rec = {
            "url": u,
            "status": st,
            "inlinks": in_degree.get(u, 0),
            "title": title_str,
            "content_length": content_len,
        }
        if depth_int is not None:
            rec["depth"] = depth_int
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

    report_data = {
        "site_name": site_display,
        "report_title": report_display_title,
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
    }
    if db_path and conn and run_id is not None:
        from .db import get_crawl_run_info as _get_crawl_run_info
        info = _get_crawl_run_info(conn, run_id)
        report_data["crawl_run_id"] = run_id
        report_data["crawl_run_created_at"] = info["created_at"] if info else None
    if lighthouse_summary:
        report_data["lighthouse_summary"] = lighthouse_summary
        report_data["lighthouse_diagnostics"] = lighthouse_summary.get("diagnostics") or []
        report_data["lighthouse_human_summary"] = lighthouse_summary.get("human_summary_full") or lighthouse_summary.get("human_summary") or ""
    report_data["lighthouse_by_url"] = lighthouse_by_url
    if db_path and conn:
        print("  Writing report payload to DB...", flush=True)
        from .db import write_report_payload as db_write_report_payload
        db_write_report_payload(conn, report_data)
        conn.close()
        conn = None
        return db_path
    raise ValueError(
        "Report requires sqlite_db. Set sqlite_db = report.db in your config; "
        "the React app in UI/ loads report.db to display the report."
    )

