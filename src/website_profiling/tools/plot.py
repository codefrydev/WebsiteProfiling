"""
Build edges from crawl data and persist nodes/edges (DB or files).
"""
import os
from typing import Optional

import pandas as pd

from ..common import load_dataframe, load_edges, save_dataframe, save_edges
from ..reporting.builder import build_edges_from_df


def run_plot(
    crawl_csv: str,
    edges_csv: str = "edges.csv",
    nodes_csv: str = "nodes.csv",
    same_domain_only: bool = True,
    max_fetch_for_edges: int = 500,
    concurrency: int = 8,
    timeout: int = 10,
    polite_delay: float = 0.15,
    db_path: Optional[str] = None,
) -> tuple[str, str]:
    """
    Load crawl data, build edges (and nodes), write to DB or CSV/JSON.
    Returns (edges_csv path, nodes_csv path).
    """
    run_id = None
    if db_path:
        print("  Loading crawl and edges from DB...", flush=True)
        from ..db import db_session, get_latest_crawl_run_id, init_schema, read_crawl, read_edges
        with db_session(db_path) as conn:
            init_schema(conn)
            run_id = get_latest_crawl_run_id(conn)
            df = read_crawl(conn, run_id)
            edges = read_edges(conn, run_id)
        print(f"  Loaded {len(df)} URLs, {len(edges)} edges.", flush=True)
        if df.empty and not edges:
            raise FileNotFoundError(f"No crawl or edges data in DB: {db_path}")
    else:
        if not os.path.exists(crawl_csv):
            raise FileNotFoundError(f"Crawl data not found: {crawl_csv}")
        print("  Loading crawl data from file...", flush=True)
        df = load_dataframe(crawl_csv)
        edges = []
        print(f"  Loaded {len(df)} URLs.", flush=True)

    if not df.empty and "url" not in df.columns:
        raise ValueError("Crawl DataFrame missing 'url' column")

    if not df.empty:
        df = df.copy()
        df["url"] = df["url"].astype(str).str.rstrip("/")

    if not edges and not df.empty:
        print("  Building edges from crawl data...", flush=True)
        edges = build_edges_from_df(
            df, edges_csv, same_domain_only, max_fetch_for_edges, concurrency, timeout, polite_delay
        )
        print(f"  Edges: {len(edges)}.", flush=True)

    if not edges and not db_path:
        edges = load_edges(edges_csv)

    if edges:
        edges_df = pd.DataFrame(edges, columns=["from", "to"])
        if db_path:
            print("  Writing edges and nodes to DB...", flush=True)
            from ..db import db_session, get_latest_crawl_run_id, init_schema, write_edges as db_write_edges, write_nodes as db_write_nodes
            with db_session(db_path) as conn:
                init_schema(conn)
                rid = run_id if run_id is not None else get_latest_crawl_run_id(conn)
                db_write_edges(conn, edges, rid)
                nodes = pd.Series(list(edges_df["from"]) + list(edges_df["to"]))
                nodes = nodes.value_counts().reset_index()
                nodes.columns = ["url", "count"]
                db_write_nodes(conn, nodes, rid)
        else:
            save_edges(edges, edges_csv)
            nodes = pd.Series(list(edges_df["from"]) + list(edges_df["to"]))
            nodes = nodes.value_counts().reset_index()
            nodes.columns = ["url", "count"]
            save_dataframe(nodes, nodes_csv)

    return edges_csv, nodes_csv
