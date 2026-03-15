# Single cell: build edges.csv from crawl CSV (or re-fetch pages) and draw graph
import sys, subprocess, importlib, time, ast, os
from urllib.parse import urljoin, urldefrag, urlparse

def ensure(pkg, import_name=None):
    name = import_name or pkg
    try:
        importlib.import_module(name)
    except Exception:
        print(f"Installing {pkg} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

for pkg in ("pandas", "requests", "beautifulsoup4", "lxml", "tqdm", "networkx", "matplotlib"):
    ensure(pkg)

import pandas as pd
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm.auto import tqdm
import networkx as nx
import matplotlib.pyplot as plt

# --------- Config you can tweak ----------
crawl_csv = "crawl_results.csv"    # used if `df` not present in notebook
edges_csv = "edges.csv"
nodes_csv = "nodes.csv"
concurrency = 8
timeout = 10
same_domain_only = True            # only keep edges within the same domain as their source
max_nodes_plot = 200               # limit nodes plotted for speed/visibility
polite_delay = 0.15                # per-request delay (seconds)
# ----------------------------------------

# safe normalizer
def normalize_link(base, href):
    if not href: return None
    href = href.strip()
    if href.startswith(("mailto:", "javascript:", "tel:", "data:")): return None
    joined = urljoin(base, href)
    joined, _ = urldefrag(joined)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http", "https"): return None
    return joined.rstrip("/")

# load df if present else csv
try:
    df  # noqa: F821
    print("Using in-memory DataFrame `df`.")
except NameError:
    if os.path.exists(crawl_csv):
        print(f"Loading crawl CSV: {crawl_csv}")
        df = pd.read_csv(crawl_csv)
    else:
        raise RuntimeError("No in-memory `df` and crawl_results.csv not found. Run crawler first.")

# ensure url column
if "url" not in df.columns:
    raise RuntimeError("crawl DataFrame missing 'url' column.")

df = df.copy()
df["url"] = df["url"].astype(str).str.rstrip("/")

# helper to parse serialized link lists safely
def parse_links_serialized(raw):
    if pd.isna(raw) or raw == "":
        return []
    if isinstance(raw, list):
        return raw
    raw_s = str(raw).strip()
    # try literal_eval if looks like a python list
    if raw_s.startswith("[") and raw_s.endswith("]"):
        try:
            val = ast.literal_eval(raw_s)
            if isinstance(val, (list, tuple)):
                return [str(x).strip().rstrip("/") for x in val if x]
        except Exception:
            pass
    # fallback: split on comma
    return [s.strip().rstrip("/") for s in raw_s.split(",") if s.strip()]

# 1) Try to build edges from existing columns (common names)
candidate_cols = [c for c in df.columns if c.lower() in ("links","edges","outlinks","outlink_targets","targets","link_targets","links_list")]
edges = []
if candidate_cols:
    print("Found candidate link column(s):", candidate_cols)
    for col in candidate_cols:
        # attempt to parse rows with meaningful content
        count_nonempty = df[col].notna().sum()
        if count_nonempty == 0:
            continue
        for src, raw in zip(df["url"], df[col].fillna("")):
            parsed = parse_links_serialized(raw)
            for t in parsed:
                if not t: continue
                if same_domain_only and urlparse(src).netloc != urlparse(t).netloc:
                    continue
                edges.append((src, t))
    if not edges:
        print("Candidate columns existed but produced no edges (format may differ).")

# 2) If no edges from CSV, re-fetch pages and extract <a> links
if not edges:
    print("No usable link column found — fetching pages to extract outgoing links.")
    session = requests.Session()
    session.headers.update({"User-Agent": "PrashantEdgeExtractor/1.0"})
    src_netlocs = {u: urlparse(u).netloc for u in df["url"].tolist()}

    def fetch_and_extract(src):
        try:
            r = session.get(src, timeout=timeout, allow_redirects=True)
            if r.status_code != 200 or not r.headers.get("Content-Type","").lower().startswith("text/html"):
                return []
            soup = BeautifulSoup(r.text, "lxml")
            out = set()
            for a in soup.find_all("a", href=True):
                ln = normalize_link(src, a["href"])
                if not ln: continue
                if same_domain_only and urlparse(src).netloc != urlparse(ln).netloc:
                    continue
                out.add(ln)
            # polite delay
            if polite_delay:
                time.sleep(polite_delay)
            return list(out)
        except Exception:
            return []

    urls = df["url"].tolist()
    edges = []
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = {ex.submit(fetch_and_extract, u): u for u in urls}
        for f in tqdm(as_completed(futures), total=len(futures), desc="Fetching pages"):
            src = futures[f]
            try:
                outs = f.result()
            except Exception:
                outs = []
            for t in outs:
                if t:
                    edges.append((src, t))

# Save edges.csv
if edges:
    edges_df = pd.DataFrame(edges, columns=["from","to"])
    edges_df.to_csv(edges_csv, index=False)
    print(f"Saved edges: {len(edges)} rows -> {edges_csv}")
else:
    print("No edges discovered; edges.csv will not be created.")
    edges_df = pd.DataFrame(columns=["from","to"])

# Save nodes.csv (counts)
if not edges_df.empty:
    nodes = pd.Series(list(edges_df["from"]) + list(edges_df["to"]))
    nodes = nodes.value_counts().reset_index()
    nodes.columns = ["url","count"]
    nodes.to_csv(nodes_csv, index=False)
    print(f"Saved nodes: {len(nodes)} -> {nodes_csv}")

# --- Draw graph (limit nodes to keep it renderable) ---
if not edges_df.empty:
    # select top nodes by occurrence to keep graph small
    top_nodes = set(nodes.head(max_nodes_plot)["url"].tolist())
    small_edges = edges_df[edges_df["from"].isin(top_nodes) & edges_df["to"].isin(top_nodes)]
    if small_edges.empty:
        # fallback: take top N nodes and include edges where either endpoint in top set
        top_nodes = set(nodes.head(max_nodes_plot)["url"].tolist())
        small_edges = edges_df[edges_df["from"].isin(top_nodes) | edges_df["to"].isin(top_nodes)]
    G = nx.DiGraph()
    for a,b in small_edges.values:
        G.add_edge(a,b)

    print(f"Graph nodes: {G.number_of_nodes()}, edges: {G.number_of_edges()} (plotted subset)")
    plt.figure(figsize=(10,10))
    # layout
    pos = nx.spring_layout(G, k=0.15, iterations=60)
    nx.draw_networkx_nodes(G, pos, node_size=40, alpha=0.9)
    nx.draw_networkx_edges(G, pos, alpha=0.3, arrowsize=6)
    # label only highest-degree nodes
    deg = dict(G.degree())
    labels = {n:n if deg.get(n,0) > 4 else "" for n in G.nodes()}
    nx.draw_networkx_labels(G, pos, labels, font_size=8)
    plt.title("Site link graph (subset)")
    plt.axis("off")
    plt.tight_layout()
    plt.show()
else:
    print("No graph to draw (edges empty).")

print("\nDone. Files created (if any):", ", ".join([p for p in (edges_csv, nodes_csv) if os.path.exists(p)]))