"""
Build edges from crawl data and persist nodes/edges to PostgreSQL.
"""
from typing import Optional

import pandas as pd

from ..reporting.builder import build_edges_from_df


def run_plot(
    same_domain_only: bool = True,
    max_fetch_for_edges: int = 500,
    concurrency: int = 8,
    timeout: int = 10,
    polite_delay: float = 0.15,
    use_database: bool = True,
) -> str:
    """
    Load crawl data, build edges (and nodes), write to PostgreSQL.
    Returns a storage label (``postgresql``).
    """
    if not use_database:
        raise ValueError("Plot requires DATABASE_URL (PostgreSQL).")

    run_id = None
    print("  Loading crawl and edges from DB...", flush=True)
    from ..db import db_session, get_latest_crawl_run_id, read_crawl, read_edges
    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
        edges = read_edges(conn, run_id)
    print(f"  Loaded {len(df)} URLs, {len(edges)} edges.", flush=True)
    if df.empty and not edges:
        raise FileNotFoundError("No crawl or edges data in database.")

    if not df.empty and "url" not in df.columns:
        raise ValueError("Crawl DataFrame missing 'url' column")

    if not df.empty:
        df = df.copy()
        df["url"] = df["url"].astype(str).str.rstrip("/")

    if not edges and not df.empty:
        print("  Building edges from crawl data...", flush=True)
        edges = build_edges_from_df(
            df, "", same_domain_only, max_fetch_for_edges, concurrency, timeout, polite_delay
        )
        print(f"  Edges: {len(edges)}.", flush=True)

    if edges:
        edges_df = pd.DataFrame(edges, columns=["from", "to"])
        print("  Writing edges and nodes to DB...", flush=True)
        from ..db import db_session, get_latest_crawl_run_id, write_edges as db_write_edges, write_nodes as db_write_nodes
        with db_session() as conn:
            rid = run_id if run_id is not None else get_latest_crawl_run_id(conn)
            db_write_edges(conn, edges, rid)
            nodes = pd.Series(list(edges_df["from"]) + list(edges_df["to"]))
            nodes = nodes.value_counts().reset_index()
            nodes.columns = ["url", "count"]
            db_write_nodes(conn, nodes, rid)

    return "postgresql"
