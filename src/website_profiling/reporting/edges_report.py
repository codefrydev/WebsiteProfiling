"""Build link edges from crawl data."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from tqdm.auto import tqdm

from ..common import LINK_COLUMN_NAMES, load_edges, normalize_link, parse_links_serialized

def build_edges_from_df(
    df: pd.DataFrame,
    edges_csv: str,
    same_domain_only: bool,
    max_fetch_for_edges: int,
    concurrency: int,
    timeout: int,
    polite_delay: float,
    render_mode: str = "static",
    js_timeout: int = 30,
    js_concurrency: int = 3,
    js_wait_until: str = "domcontentloaded",
    js_extra_wait_ms: int = 1500,
    js_block_resources: bool = True,
) -> list[tuple[str, str]]:
    """Build or load edges; return list of (from, to) tuples."""
    edges = load_edges(edges_csv) if (edges_csv or "").strip() else []
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
    mode = (render_mode or "static").strip().lower()
    use_js = mode in ("javascript", "auto")
    fetcher = None
    if use_js:
        from ..crawl.fetchers import build_fetcher

        fetcher = build_fetcher(
            render_mode="javascript" if mode == "javascript" else "auto",
            timeout=timeout,
            user_agent="WebsiteProfiling/1.0",
            session=session,
            js_timeout=js_timeout,
            js_concurrency=js_concurrency,
            js_wait_until=js_wait_until,
            js_extra_wait_ms=js_extra_wait_ms,
            js_block_resources=js_block_resources,
        )

    def fetch(src):
        try:
            if fetcher is not None:
                r = fetcher.fetch(src)
                if r.status != 200 or not r.text:
                    return []
                html = r.text
            else:
                resp = session.get(src, timeout=timeout, allow_redirects=True)
                if resp.status_code != 200 or not resp.headers.get("Content-Type", "").lower().startswith("text/html"):
                    return []
                html = resp.text
            soup = BeautifulSoup(html, "lxml")
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

    try:
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
    finally:
        if fetcher is not None:
            try:
                fetcher.close()
            except Exception:
                pass
    return edges
