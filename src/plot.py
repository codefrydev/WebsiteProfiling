"""
Build edges from crawl data and draw site link graph with matplotlib.
"""
import os
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd

from .common import load_dataframe, load_edges, save_dataframe, save_edges
from .report import build_edges_from_df


def run_plot(
    crawl_csv: str,
    edges_csv: str = "edges.csv",
    nodes_csv: str = "nodes.csv",
    image_output: Optional[str] = None,
    same_domain_only: bool = True,
    max_nodes_plot: int = 200,
    max_fetch_for_edges: int = 500,
    concurrency: int = 8,
    timeout: int = 10,
    polite_delay: float = 0.15,
) -> tuple[str, str]:
    """
    Load crawl data, build edges (and nodes.csv), optionally draw graph to image.
    Returns (edges_csv path, nodes_csv path).
    """
    if not os.path.exists(crawl_csv):
        raise FileNotFoundError(f"Crawl data not found: {crawl_csv}")

    df = load_dataframe(crawl_csv)
    if "url" not in df.columns:
        raise ValueError("Crawl DataFrame missing 'url' column")

    df = df.copy()
    df["url"] = df["url"].astype(str).str.rstrip("/")

    edges = build_edges_from_df(
        df, edges_csv, same_domain_only, max_fetch_for_edges, concurrency, timeout, polite_delay
    )

    if not edges:
        edges = load_edges(edges_csv)
    if edges:
        edges_df = pd.DataFrame(edges, columns=["from", "to"])
        save_edges(edges, edges_csv)
        nodes = pd.Series(list(edges_df["from"]) + list(edges_df["to"]))
        nodes = nodes.value_counts().reset_index()
        nodes.columns = ["url", "count"]
        save_dataframe(nodes, nodes_csv)
    else:
        edges_df = pd.DataFrame(columns=["from", "to"])
        nodes = pd.DataFrame(columns=["url", "count"])

    if not edges_df.empty and image_output:
        top_nodes = set(nodes.head(max_nodes_plot)["url"].tolist())
        small_edges = edges_df[edges_df["from"].isin(top_nodes) & edges_df["to"].isin(top_nodes)]
        if small_edges.empty:
            small_edges = edges_df[edges_df["from"].isin(top_nodes) | edges_df["to"].isin(top_nodes)]
        G = nx.DiGraph()
        for a, b in small_edges.values:
            G.add_edge(a, b)
        plt.figure(figsize=(10, 10))
        pos = nx.spring_layout(G, k=0.15, iterations=60)
        nx.draw_networkx_nodes(G, pos, node_size=40, alpha=0.9)
        nx.draw_networkx_edges(G, pos, alpha=0.3, arrowsize=6)
        deg = dict(G.degree())
        labels = {n: n if deg.get(n, 0) > 4 else "" for n in G.nodes()}
        nx.draw_networkx_labels(G, pos, labels, font_size=8)
        plt.title("Site link graph (subset)")
        plt.axis("off")
        plt.tight_layout()
        fmt = "svg" if image_output.lower().endswith(".svg") else None
        plt.savefig(image_output, format=fmt, dpi=100)
        plt.close()

    return edges_csv, nodes_csv
