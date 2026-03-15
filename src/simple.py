# Fixed: produce interactive HTML report (Chart.js + vis-network)
# Paste & run this whole cell in Jupyter.
import sys, subprocess, importlib, json, os, time, ast
from urllib.parse import urljoin, urldefrag, urlparse

# ----------------- auto-install helper -----------------
def ensure(pkg, import_name=None):
    name = import_name or pkg
    try:
        importlib.import_module(name)
    except Exception:
        print(f"Installing {pkg} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
        
for pkg in ("pandas", "requests", "beautifulsoup4", "lxml", "tqdm"):
    ensure(pkg)

import pandas as pd
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm.auto import tqdm
import math

# -------------- config (edit if needed) --------------
crawl_csv = "crawl_results.csv"   # fallback if df not in notebook
edges_csv = "edges.csv"
max_fetch_for_edges = 300         # max pages to fetch when building edges (safe default)
concurrency = 6
timeout = 8
same_domain_only = True           # keep edges same-domain (usually desired)
polite_delay = 0.12               # small delay between requests
output_html = "site_report.html"
# -----------------------------------------------------

# -------------- helpers ----------------
def normalize_link(base, href):
    if not href: 
        return None
    href = href.strip()
    if href.startswith(("mailto:", "javascript:", "tel:", "data:")):
        return None
    joined = urljoin(base, href)
    joined, _ = urldefrag(joined)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http", "https"):
        return None
    return joined.rstrip("/")

def parse_links_serialized(raw):
    if pd.isna(raw) or raw == "":
        return []
    if isinstance(raw, list):
        return raw
    s = str(raw).strip()
    if s.startswith("[") and s.endswith("]"):
        try:
            v = ast.literal_eval(s)
            if isinstance(v, (list, tuple)):
                return [str(x).strip().rstrip("/") for x in v if x]
        except Exception:
            pass
    # fallback: comma-split
    return [t.strip().rstrip("/") for t in s.split(",") if t.strip()]

# -------------- load crawl data ----------------
try:
    df  # use in-memory variable if present
    print("Using in-memory DataFrame `df`.")
except NameError:
    if os.path.exists(crawl_csv):
        print(f"Loading {crawl_csv} ...")
        df = pd.read_csv(crawl_csv)
    else:
        raise RuntimeError("No in-memory `df` and crawl_results.csv not found. Run crawler first.")

if "url" not in df.columns:
    raise RuntimeError("crawl DataFrame missing required column 'url'.")

df = df.copy()
df["url"] = df["url"].astype(str).str.rstrip("/")
start_domain = urlparse(df["url"].iat[0]).netloc if not df.empty else ""

# -------------- build or load edges ----------------
edges = []
if os.path.exists(edges_csv):
    try:
        edf = pd.read_csv(edges_csv)
        if {"from","to"}.issubset(edf.columns):
            edges = [(str(a).rstrip("/"), str(b).rstrip("/")) for a,b in edf[["from","to"]].values]
            print(f"Loaded {len(edges)} edges from {edges_csv}.")
    except Exception:
        edges = []

if not edges:
    # try candidate columns in df
    candidate_cols = [c for c in df.columns if c.lower() in ("links","edges","outlinks","outlink_targets","targets","links_list")]
    used_col = None
    if candidate_cols:
        for col in candidate_cols:
            nonempty = df[col].notna().sum()
            if nonempty == 0:
                continue
            for src, raw in zip(df["url"], df[col].fillna("")):
                for t in parse_links_serialized(raw):
                    if not t: continue
                    if same_domain_only and urlparse(src).netloc != urlparse(t).netloc:
                        continue
                    edges.append((src, t))
            if edges:
                used_col = col
                print(f"Built edges from DataFrame column: {col} ({len(edges)} edges).")
                break

    # if still no edges, re-fetch pages up to a cap
    if not edges:
        print("No edge column present — extracting outgoing links by fetching pages (capped).")
        session = requests.Session()
        session.headers.update({"User-Agent":"PrashantEdgeExtractor/1.0"})
        urls = df["url"].tolist()[:max_fetch_for_edges]
        def fetch(src):
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
        print(f"Extracted {len(edges)} edges by re-fetching (limited to {len(urls)} pages).")
    # save edges if found
    if edges:
        edf = pd.DataFrame(edges, columns=["from","to"])
        edf.to_csv(edges_csv, index=False)
        print(f"Saved edges to {edges_csv} ({len(edges)} rows).")

# -------------- prepare chart data in Python ----------------
# status counts
df["status_str"] = df["status"].astype(str) if "status" in df.columns else "unknown"
status_counts = df["status_str"].value_counts().to_dict()

# mimes
df["mime"] = df["content_type"].fillna("").apply(lambda s: s.split(";")[0].strip() if isinstance(s, str) and s else "unknown") if "content_type" in df.columns else "unknown"
top_mimes = df["mime"].value_counts().head(20)
mime_labels = top_mimes.index.tolist()
mime_values = top_mimes.values.tolist()

# outlinks histogram bins (compute in python)
outlinks = pd.to_numeric(df["outlinks"], errors="coerce").fillna(0).astype(int) if "outlinks" in df.columns else pd.Series([0]*len(df))
# choose bins (0,1,2,3-5,6-10,11-20,21-50,51+)
bins = [0,1,2,3,6,11,21,51,999999]
labels = ["0","1","2","3-5","6-10","11-20","21-50","51+"]
counts = []
for i in range(len(bins)-1):
    lo, hi = bins[i], bins[i+1]
    counts.append(int(((outlinks >= lo) & (outlinks < hi)).sum()))

# title length histogram
title_len = df["title"].fillna("").astype(str).apply(len) if "title" in df.columns else pd.Series([0]*len(df))
# buckets: 0,1-20,21-50,51-100,101-200,200+
t_bins = [0,1,21,51,101,201,9999]
t_labels = ["0","1-20","21-50","51-100","101-200","200+"]
t_counts = []
for i in range(len(t_bins)-1):
    lo, hi = t_bins[i], t_bins[i+1]
    t_counts.append(int(((title_len >= lo) & (title_len < hi)).sum()))

# top domains
df["domain"] = df["url"].apply(lambda u: urlparse(u).netloc if pd.notna(u) else "")
top_domains = df["domain"].value_counts().head(20)
domain_labels = top_domains.index.tolist()
domain_values = top_domains.values.tolist()

# edges/nodes for graph
if edges:
    # build node list and edge list limited to top N nodes for performance in visual (we'll keep top by degree)
    edf = pd.DataFrame(edges, columns=["from","to"])
    nodes = pd.Series(list(edf["from"]) + list(edf["to"])).value_counts().reset_index()
    nodes.columns = ["url","count"]
    # pick top N nodes for graph (300 default)
    max_nodes_plot = 300
    top_nodes = set(nodes.head(max_nodes_plot)["url"].tolist())
    small_edges = edf[edf["from"].isin(top_nodes) & edf["to"].isin(top_nodes)].copy()
    if small_edges.empty:
        small_edges = edf[edf["from"].isin(top_nodes) | edf["to"].isin(top_nodes)].copy()
    graph_nodes = list(top_nodes)
    graph_edges = small_edges.to_dict(orient="records")
else:
    graph_nodes, graph_edges = [], []

# -------------- build HTML safely by concatenation ----------------
js_status = json.dumps(status_counts)
js_mime_labels = json.dumps(mime_labels)
js_mime_values = json.dumps(mime_values)
js_outlink_labels = json.dumps(labels)
js_outlink_counts = json.dumps(counts)
js_title_labels = json.dumps(t_labels)
js_title_counts = json.dumps(t_counts)
js_domain_labels = json.dumps(domain_labels)
js_domain_values = json.dumps(domain_values)
js_graph_nodes = json.dumps(graph_nodes)
js_graph_edges = json.dumps(graph_edges)

html = (
"<!doctype html>\n"
"<html>\n"
"<head>\n"
'  <meta charset="utf-8">\n'
'  <title>Site Crawl Report</title>\n'
'  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
'  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n'
'  <script type="text/javascript" src="https://unpkg.com/vis-network@9.1.2/dist/vis-network.min.js"></script>\n'
'  <link href="https://unpkg.com/vis-network@9.1.2/styles/vis-network.min.css" rel="stylesheet" type="text/css" />\n'
"  <style>\n"
"    body { font-family: Arial, sans-serif; margin: 12px; }\n"
"    .chart-row { display:flex; flex-wrap:wrap; gap:20px; }\n"
"    .chart-card { flex:1 1 420px; min-width:300px; background:#fff; padding:12px; border-radius:8px; box-shadow:0 1px 6px rgba(0,0,0,0.08); }\n"
"    #network { width: 100%; height: 700px; border: 1px solid #ddd; border-radius:8px; }\n"
"    h2 { margin:6px 0 12px 0; }\n"
"  </style>\n"
"</head>\n"
"<body>\n"
f"  <h1>Interactive Site Crawl Report</h1>\n"
f"  <p>Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>\n\n"
"  <div class=\"chart-row\">\n"
"    <div class=\"chart-card\">\n"
"      <h2>Status counts</h2>\n"
"      <canvas id=\"statusChart\"></canvas>\n"
"    </div>\n"
"    <div class=\"chart-card\">\n"
"      <h2>Top content-types</h2>\n"
"      <canvas id=\"mimeChart\"></canvas>\n"
"    </div>\n"
"  </div>\n\n"
"  <div class=\"chart-row\">\n"
"    <div class=\"chart-card\">\n"
"      <h2>Outlinks distribution</h2>\n"
"      <canvas id=\"outlinksChart\"></canvas>\n"
"    </div>\n"
"    <div class=\"chart-card\">\n"
"      <h2>Title length distribution</h2>\n"
"      <canvas id=\"titleChart\"></canvas>\n"
"    </div>\n"
"  </div>\n\n"
"  <div class=\"chart-row\">\n"
"    <div class=\"chart-card\" style=\"flex:1 1 100%;\">\n"
"      <h2>Top domains discovered</h2>\n"
"      <canvas id=\"domainChart\"></canvas>\n"
"    </div>\n"
"  </div>\n\n"
"  <h2>Interactive Site Graph</h2>\n"
"  <div id=\"network\"></div>\n\n"
"  <script>\n"
# embed data blobs
"    const statusData = " + js_status + ";\n"
"    const mimeLabels = " + js_mime_labels + ";\n"
"    const mimeValues = " + js_mime_values + ";\n"
"    const outlinkBuckets = " + js_outlink_labels + ";\n"
"    const outlinkCounts = " + js_outlink_counts + ";\n"
"    const titleBuckets = " + js_title_labels + ";\n"
"    const titleCounts = " + js_title_counts + ";\n"
"    const domainLabels = " + js_domain_labels + ";\n"
"    const domainValues = " + js_domain_values + ";\n"
"    const graphNodes = " + js_graph_nodes + ";\n"
"    const graphEdges = " + js_graph_edges + ";\n\n"
"    const statusLabels = Object.keys(statusData);\n"
"    const statusCounts = Object.values(statusData);\n\n"
"    const ctxStatus = document.getElementById('statusChart').getContext('2d');\n"
"    new Chart(ctxStatus, {\n"
"      type: 'bar',\n"
"      data: { labels: statusLabels, datasets: [{ label: 'Pages', data: statusCounts }] },\n"
"      options: { indexAxis: 'y', responsive:true, plugins: { legend: { display:false } } }\n"
"    });\n\n"
"    const ctxMime = document.getElementById('mimeChart').getContext('2d');\n"
"    new Chart(ctxMime, { type: 'bar', data: { labels: mimeLabels, datasets: [{ label: 'Count', data: mimeValues }] }, options: { responsive:true, plugins: { legend: { display:false } }, scales: { x: { beginAtZero:true } } } });\n\n"
"    const ctxOut = document.getElementById('outlinksChart').getContext('2d');\n"
"    new Chart(ctxOut, { type: 'bar', data: { labels: outlinkBuckets, datasets:[{ label:'Pages', data: outlinkCounts }] }, options: { responsive:true } });\n\n"
"    const ctxTitle = document.getElementById('titleChart').getContext('2d');\n"
"    new Chart(ctxTitle, { type: 'bar', data: { labels: titleBuckets, datasets:[{ label:'Pages', data: titleCounts }] }, options: { responsive:true } });\n\n"
"    const ctxDom = document.getElementById('domainChart').getContext('2d');\n"
"    new Chart(ctxDom, { type: 'bar', data: { labels: domainLabels, datasets:[{ label:'Pages', data: domainValues }] }, options: { responsive:true, indexAxis:'x', scales: { x: { beginAtZero:true } } } });\n\n"
"    (function renderNetwork(){\n"
"      if(!graphNodes || graphNodes.length===0 || !graphEdges || graphEdges.length===0){\n"
"        document.getElementById('network').innerHTML = \"<p style='padding:20px;color:#666'>No edge data available to render the site graph. Re-run the crawler with edge collection or allow edges generation.</p>\";\n"
"        return;\n"
"      }\n"
"      const nodeMap = new Map();\n"
"      graphNodes.forEach((u,i) => { nodeMap.set(u, {id: u, label: u.split('/').slice(2).join('/'), title: u, value:1}); });\n"
"      graphEdges.forEach(e => {\n"
"        if(!nodeMap.has(e.from)) nodeMap.set(e.from, {id:e.from,label:e.from,title:e.from});\n"
"        if(!nodeMap.has(e.to)) nodeMap.set(e.to, {id:e.to,label:e.to,title:e.to});\n"
"        if(nodeMap.get(e.from)) nodeMap.get(e.from).value = (nodeMap.get(e.from).value||1)+1;\n"
"        if(nodeMap.get(e.to)) nodeMap.get(e.to).value = (nodeMap.get(e.to).value||1)+0.5;\n"
"      });\n"
"      const nodes = Array.from(nodeMap.values()).map(n => Object.assign({shape:'dot', scaling:{min:10,max:40}}, n));\n"
"      const edges = graphEdges.map(e => ({from:e.from, to:e.to, arrows:'to'}));\n"
"      const container = document.getElementById('network');\n"
"      const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };\n"
"      const options = {\n"
"        nodes: { shape: 'dot', scaling: { label: { min:8, max:24 } }, font: { size: 12, face: 'Arial' } },\n"
"        edges: { smooth: { type:'force' }, arrows: { to: {enabled:true, scaleFactor:0.6} } },\n"
"        physics: { stabilization: true, barnesHut: { gravitationalConstant: -8000, springConstant: 0.001, springLength: 200 } },\n"
"        interaction: { hover:true, navigationButtons:true, zoomView:true }\n"
"      };\n"
"      const network = new vis.Network(container, data, options);\n"
"      network.on('doubleClick', function(params){ if(params.nodes && params.nodes.length>0){ const url = params.nodes[0]; window.open(url, '_blank'); }});\n"
"    })();\n"
"  </script>\n"
"</body>\n"
"</html>\n"
)

# -------------- write out HTML file ----------------
with open(output_html, "w", encoding="utf-8") as fh:
    fh.write(html)
print(f"Wrote interactive report to: {output_html}")

# -------------- display in notebook if available ----------------
try:
    from IPython.display import IFrame, display
    display(IFrame(output_html, width="100%", height=900))
except Exception:
    print("Run in Jupyter to preview; open the file in your browser to view the interactive report.")