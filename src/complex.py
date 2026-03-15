# Enhanced interactive site-report (single Jupyter cell)
# - auto-installs packages
# - builds edges if needed (capped)
# - computes graph metrics (networkx)
# - produces a rich interactive HTML: Chart.js, vis-network, table, filters, export
import sys, subprocess, importlib, json, os, time, ast, math
from urllib.parse import urljoin, urldefrag, urlparse

# ---------- auto-install helper ----------
def ensure(pkg, import_name=None):
    name = import_name or pkg
    try:
        importlib.import_module(name)
    except Exception:
        print(f"Installing {pkg} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
for pkg in ("pandas","requests","beautifulsoup4","lxml","tqdm","networkx"):
    ensure(pkg)

import pandas as pd
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm.auto import tqdm
import networkx as nx

# ---------- Config (edit if desired) ----------
crawl_csv = "crawl_results.csv"
edges_csv = "edges.csv"
nodes_csv = "nodes.csv"
output_html = "site_report_advanced.html"
max_fetch_for_edges = 300       # cap pages to re-fetch for edges
concurrency = 6
timeout = 8
polite_delay = 0.10
same_domain_only = True
max_nodes_plot = 400           # limit nodes included in initial graph for performance
# ------------------------------------------------

# ---------- helpers ----------
def normalize_link(base, href):
    if not href: return None
    href = href.strip()
    if href.startswith(("mailto:","javascript:","tel:","data:")): return None
    joined = urljoin(base, href)
    joined, _ = urldefrag(joined)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http","https"): return None
    return joined.rstrip("/")

def parse_links_serialized(raw):
    if pd.isna(raw) or raw == "": return []
    if isinstance(raw, list): return raw
    s = str(raw).strip()
    if s.startswith("[") and s.endswith("]"):
        try:
            v = ast.literal_eval(s)
            if isinstance(v, (list,tuple)): return [str(x).strip().rstrip("/") for x in v if x]
        except Exception:
            pass
    return [t.strip().rstrip("/") for t in s.split(",") if t.strip()]

# ---------- load crawl data ----------
try:
    df  # use in-memory df if exists
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

# ---------- build or load edges ----------
edges = []
if os.path.exists(edges_csv):
    try:
        edf = pd.read_csv(edges_csv)
        if {"from","to"}.issubset(edf.columns):
            edges = [(str(a).rstrip("/"), str(b).rstrip("/")) for a,b in edf[["from","to"]].values]
            print(f"Loaded {len(edges)} edges from {edges_csv}")
    except Exception:
        edges = []

if not edges:
    # attempt candidate columns
    candidate_cols = [c for c in df.columns if c.lower() in ("links","edges","outlinks","outlink_targets","targets","links_list")]
    if candidate_cols:
        for col in candidate_cols:
            if df[col].notna().sum() == 0:
                continue
            for src, raw in zip(df["url"], df[col].fillna("")):
                for t in parse_links_serialized(raw):
                    if not t: continue
                    if same_domain_only and urlparse(src).netloc != urlparse(t).netloc:
                        continue
                    edges.append((src,t))
            if edges:
                print(f"Built edges from DataFrame column `{col}` ({len(edges)} edges)")
                break

if not edges:
    print("No edges column found; extracting links by fetching pages (capped).")
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
        for f in tqdm(as_completed(futures), total=len(futures), desc="Fetching pages for edges"):
            src = futures[f]
            try:
                outs = f.result()
            except Exception:
                outs = []
            for t in outs:
                edges.append((src,t))
    print(f"Extracted {len(edges)} edges by fetching up to {len(urls)} pages.")

# save edges
if edges:
    edf = pd.DataFrame(edges, columns=["from","to"])
    edf.to_csv(edges_csv, index=False)
    print(f"Saved edges.csv ({len(edges)} rows).")

# ---------- compute metrics if edges exist ----------
graph_nodes = []
graph_edges = []
node_metrics = pd.DataFrame()
if edges:
    G = nx.DiGraph()
    G.add_edges_from(edges)
    # ensure nodes from crawl appear even if isolated
    for u in df["url"].tolist():
        if u not in G:
            G.add_node(u)
    # compute degrees
    indeg = dict(G.in_degree())
    outdeg = dict(G.out_degree())
    deg = dict(G.degree())
    # pagerank
    try:
        pr = nx.pagerank(G, alpha=0.85, max_iter=200)
    except Exception:
        pr = {n:0.0 for n in G.nodes()}
    # strongly connected components sizes
    scc = list(nx.strongly_connected_components(G))
    scc_map = {}
    for i,comp in enumerate(scc):
        for n in comp:
            scc_map[n] = {"scc_id": i, "scc_size": len(comp)}
    # build node metrics df
    rows = []
    for n in G.nodes():
        rows.append({
            "url": n,
            "in_degree": int(indeg.get(n,0)),
            "out_degree": int(outdeg.get(n,0)),
            "degree": int(deg.get(n,0)),
            "pagerank": float(pr.get(n,0.0)),
            "scc_id": scc_map.get(n,{}).get("scc_id", -1),
            "scc_size": scc_map.get(n,{}).get("scc_size", 0)
        })
    node_metrics = pd.DataFrame(rows)
    node_metrics = node_metrics.merge(df[["url","title","status","content_type","outlinks"]].drop_duplicates(subset=["url"]), on="url", how="left")
    # prepare graph lists limited by top nodes
    nodes_sorted = node_metrics.sort_values(["degree","pagerank"], ascending=[False, False])
    top_nodes = set(nodes_sorted.head(max_nodes_plot)["url"].tolist())
    small_edges_df = edf[edf["from"].isin(top_nodes) & edf["to"].isin(top_nodes)].copy()
    if small_edges_df.empty:
        small_edges_df = edf[edf["from"].isin(top_nodes) | edf["to"].isin(top_nodes)].copy()
    graph_nodes = []
    # build node objects with metric-driven sizes
    for _, r in node_metrics[node_metrics["url"].isin(top_nodes)].iterrows():
        graph_nodes.append({
            "id": r["url"],
            "label": (r["title"][:60] if pd.notna(r.get("title")) and r.get("title")!="" else r["url"].replace("https://","").replace("http://","")),
            "title": r["url"],
            "in_degree": int(r["in_degree"]),
            "out_degree": int(r["out_degree"]),
            "degree": int(r["degree"]),
            "pagerank": float(r["pagerank"]),
            "scc_size": int(r["scc_size"])
        })
    graph_edges = small_edges_df.to_dict(orient="records")
    # save nodes csv
    node_metrics.to_csv(nodes_csv, index=False)
    print(f"Computed graph metrics for {len(node_metrics)} nodes; saved {nodes_csv}.")

# ---------- prepare chart data ----------
# status counts
df["status_str"] = df["status"].astype(str) if "status" in df.columns else "unknown"
status_counts = df["status_str"].value_counts().to_dict()
# mimes
df["mime"] = df["content_type"].fillna("").apply(lambda s: s.split(";")[0].strip() if isinstance(s,str) and s else "unknown") if "content_type" in df.columns else "unknown"
top_mimes = df["mime"].value_counts().head(30)
mime_labels = top_mimes.index.tolist()
mime_values = top_mimes.values.tolist()
# outlinks buckets
outlinks = pd.to_numeric(df["outlinks"], errors="coerce").fillna(0).astype(int) if "outlinks" in df.columns else pd.Series([0]*len(df))
bins = [0,1,2,3,6,11,21,51,999999]
labels = ["0","1","2","3-5","6-10","11-20","21-50","51+"]
counts = []
for i in range(len(bins)-1):
    lo,hi = bins[i], bins[i+1]
    counts.append(int(((outlinks>=lo)&(outlinks<hi)).sum()))
# title lengths
title_len = df["title"].fillna("").astype(str).apply(len) if "title" in df.columns else pd.Series([0]*len(df))
t_bins = [0,1,21,51,101,201,9999]
t_labels = ["0","1-20","21-50","51-100","101-200","200+"]
t_counts = []
for i in range(len(t_bins)-1):
    lo,hi = t_bins[i], t_bins[i+1]
    t_counts.append(int(((title_len>=lo)&(title_len<hi)).sum()))
# top domains
df["domain"] = df["url"].apply(lambda u: urlparse(u).netloc if pd.notna(u) else "")
top_domains = df["domain"].value_counts().head(30)
domain_labels = top_domains.index.tolist()
domain_values = top_domains.values.tolist()
# top pages by metrics (top 20)
top_in = node_metrics.sort_values("in_degree", ascending=False).head(20).to_dict(orient="records") if not node_metrics.empty else []
top_out = node_metrics.sort_values("out_degree", ascending=False).head(20).to_dict(orient="records") if not node_metrics.empty else []
top_pr = node_metrics.sort_values("pagerank", ascending=False).head(20).to_dict(orient="records") if not node_metrics.empty else []
# scc sizes distribution
scc_sizes = node_metrics["scc_size"].value_counts().sort_index().to_dict() if not node_metrics.empty else {}

# ---------- embed JSON blobs ----------
js = {
    "status_counts": status_counts,
    "mime_labels": mime_labels, "mime_values": mime_values,
    "outlink_labels": labels, "outlink_counts": counts,
    "title_labels": t_labels, "title_counts": t_counts,
    "domain_labels": domain_labels, "domain_values": domain_values,
    "graph_nodes": graph_nodes, "graph_edges": graph_edges,
    "node_table": node_metrics.to_dict(orient="records") if not node_metrics.empty else [],
    "top_in": top_in, "top_out": top_out, "top_pr": top_pr,
    "scc_sizes": scc_sizes
}
js_blob = json.dumps(js)

# ---------- build HTML by concatenation (avoid f-string interpolation issues) ----------
html = (
"<!doctype html>\n"
"<html>\n"
"<head>\n"
"  <meta charset='utf-8'>\n"
"  <title>Site Report — Advanced</title>\n" 
"  <meta name='viewport' content='width=device-width, initial-scale=1'>\n"
"  <script src='https://cdn.jsdelivr.net/npm/chart.js'></script>\n"
"  <script type='text/javascript' src='https://unpkg.com/vis-network@9.1.2/dist/vis-network.min.js'></script>\n"
"  <link href='https://unpkg.com/vis-network@9.1.2/styles/vis-network.min.css' rel='stylesheet' />\n"
"  <style>\n"
"    body{font-family:Arial,Helvetica,sans-serif;margin:12px;background:#f7f8fb}\n"
"    .row{display:flex;gap:16px;flex-wrap:wrap}\n"
"    .card{background:white;padding:12px;border-radius:8px;box-shadow:0 1px 8px rgba(0,0,0,0.06);flex:1 1 420px;min-width:300px}\n"
"    #network{width:100%;height:680px;border-radius:8px;border:1px solid #ddd;background:#fff}\n"
"    table{width:100%;border-collapse:collapse}\n" 
"    th,td{padding:6px;border-bottom:1px solid #eee;text-align:left}\n"
"    .controls{display:flex;gap:8px;align-items:center}\n" 
"    .muted{color:#666;font-size:0.9em}\n"
"    .small{font-size:0.9em}\n" 
"    #nodeTableWrap{overflow:auto;max-height:420px}\n"
"    .btn{padding:6px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer}\n"
"  </style>\n"
"</head>\n"
"<body>\n"
"  <h1>Site Report — Advanced</h1>\n"
"  <p class='muted'>Generated: " + time.strftime("%Y-%m-%d %H:%M:%S") + "</p>\n"
"  <div class='row'>\n"
"    <div class='card'>\n"
"      <h3>Status counts</h3>\n" 
"      <canvas id='statusChart'></canvas>\n" 
"    </div>\n"
"    <div class='card'>\n"
"      <h3>Top content-types</h3>\n"
"      <canvas id='mimeChart'></canvas>\n"
"    </div>\n"
"  </div>\n"
"  <div class='row' style='margin-top:12px'>\n"
"    <div class='card'>\n"
"      <h3>Outlinks distribution</h3>\n"
"      <canvas id='outlinksChart'></canvas>\n"
"    </div>\n"
"    <div class='card'>\n"
"      <h3>Title length distribution</h3>\n"
"      <canvas id='titleChart'></canvas>\n"
"    </div>\n" 
"  </div>\n"
"  <div class='row' style='margin-top:12px'>\n"
"    <div class='card' style='flex:1 1 100%'>\n"
"      <h3>Top domains discovered</h3>\n"
"      <canvas id='domainChart'></canvas>\n"
"    </div>\n" 
"  </div>\n"
"  <div class='row' style='margin-top:12px'>\n"
"    <div class='card' style='flex:1 1 60%'>\n"
"      <h3>Interactive Site Graph</h3>\n"
"      <div class='controls'>\n"
"        <label class='small'>min degree: <input id='minDegree' type='number' value='0' style='width:68px;margin-left:6px'></label>\n"
"        <label class='small'>max nodes: <input id='maxNodes' type='number' value='200' style='width:80px;margin-left:6px'></label>\n"
"        <button id='applyFilter' class='btn'>Apply</button>\n"
"        <button id='resetGraph' class='btn'>Reset</button>\n" 
"        <label style='margin-left:auto' class='muted'>Double-click node to open page</label>\n"
"      </div>\n"
"      <div id='network'></div>\n"
"    </div>\n"
"    <div class='card' style='flex:1 1 35%'>\n"
"      <h3>Node metrics (top)</h3>\n"
"      <div id='metricsList' class='small'></div>\n" 
"      <h4 style='margin-top:12px'>Quick filters</h4>\n"
"      <div class='controls' style='flex-wrap:wrap'>\n"
"        <button id='showTopPR' class='btn'>Top PageRank</button>\n"
"        <button id='showTopIn' class='btn'>Top In-Degree</button>\n"
"        <button id='showTopOut' class='btn'>Top Out-Degree</button>\n"
"        <button id='downloadNodes' class='btn'>Download nodes.csv</button>\n"
"        <button id='downloadEdges' class='btn'>Download edges.csv</button>\n"
"      </div>\n"
"    </div>\n"
"  </div>\n"
"  <div class='row' style='margin-top:12px'>\n"
"    <div class='card' style='flex:1 1 100%'>\n"
"      <h3>Nodes table (filter & export)</h3>\n"
"      <div style='display:flex;gap:8px;margin-bottom:8px'>\n"
"        <input id='nodeSearch' placeholder='search url or title' style='flex:1;padding:6px'>\n"
"        <button id='exportCSV' class='btn'>Export visible CSV</button>\n" 
"      </div>\n"
"      <div id='nodeTableWrap'><table id='nodeTable'><thead><tr><th>url</th><th>title</th><th>in</th><th>out</th><th>deg</th><th>pagerank</th><th>scc_size</th></tr></thead><tbody></tbody></table></div>\n"
"    </div>\n"
"  </div>\n"
"  <div style='margin-top:12px' class='muted'>Tip: adjust min degree / max nodes and click Apply to filter graph. Use quick filters to focus on important pages.</div>\n"
"  <script>\n"
"    const js = " + js_blob + ";\n"
"    // Charts\n"
"    const statusLabels = Object.keys(js.status_counts); const statusValues = Object.values(js.status_counts);\n"
"    const ctxS = document.getElementById('statusChart').getContext('2d');\n"
"    new Chart(ctxS, {type:'bar', data:{labels:statusLabels, datasets:[{label:'Pages', data:statusValues}]}, options:{indexAxis:'y', responsive:true, plugins:{legend:{display:false}}}});\n"
"    const ctxM = document.getElementById('mimeChart').getContext('2d');\n"
"    new Chart(ctxM,{type:'bar', data:{labels:js.mime_labels, datasets:[{label:'Count', data:js.mime_values}]}, options:{responsive:true, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true}}}});\n"
"    const ctxO = document.getElementById('outlinksChart').getContext('2d');\n"
"    new Chart(ctxO,{type:'bar', data:{labels:js.outlink_labels, datasets:[{label:'Pages', data:js.outlink_counts}]}, options:{responsive:true}});\n"
"    const ctxT = document.getElementById('titleChart').getContext('2d');\n"
"    new Chart(ctxT,{type:'bar', data:{labels:js.title_labels, datasets:[{label:'Pages', data:js.title_counts}]}, options:{responsive:true}});\n"
"    const ctxD = document.getElementById('domainChart').getContext('2d');\n"
"    new Chart(ctxD,{type:'bar', data:{labels:js.domain_labels, datasets:[{label:'Pages', data:js.domain_values}]}, options:{responsive:true, scales:{x:{beginAtZero:true}}}});\n"
"\n"
"    // build node list table\n"
"    const nodeData = js.node_table || [];\n" 
"    const tbody = document.querySelector('#nodeTable tbody');\n" 
"    function renderTable(filterText=''){\n"
"      tbody.innerHTML='';\n"
"      const q = filterText.trim().toLowerCase();\n" 
"      nodeData.forEach(r => {\n" 
"        const text = ((r.url||'')+' '+(r.title||'')).toLowerCase();\n" 
"        if(q && text.indexOf(q)===-1) return;\n" 
"        const tr = document.createElement('tr');\n" 
"        tr.innerHTML = `<td><a href='${r.url}' target='_blank' rel='noreferrer noopener'>${r.url}</a></td><td>${(r.title||'').replace(/</g,'&lt;')}</td><td>${r.in_degree||0}</td><td>${r.out_degree||0}</td><td>${r.degree||0}</td><td>${(+r.pagerank||0).toFixed(5)}</td><td>${r.scc_size||0}</td>`;\n" 
"        tbody.appendChild(tr);\n" 
"      });\n" 
"    }\n" 
"    document.getElementById('nodeSearch').addEventListener('input', e => renderTable(e.target.value));\n" 
"    document.getElementById('exportCSV').addEventListener('click', ()=>{\n" 
"      // export visible rows\n" 
"      const rows = [['url','title','in_degree','out_degree','degree','pagerank','scc_size']];\n" 
"      const trs = Array.from(document.querySelectorAll('#nodeTable tbody tr'));\n" 
"      trs.forEach(tr=>{\n" 
"        const cols = Array.from(tr.querySelectorAll('td')).map(td=>td.innerText.replace(/\\n/g,' '));\n" 
"        rows.push(cols);\n" 
"      });\n" 
"      const csv = rows.map(r=>r.map(c=>`\"${(c+'').replace(/\"/g,'\"\"')}\"`).join(',')).join('\\n');\n" 
"      const blob = new Blob([csv], {type:'text/csv'});\n" 
"      const url = URL.createObjectURL(blob);\n" 
"      const a = document.createElement('a'); a.href=url; a.download='nodes_visible.csv'; a.click(); URL.revokeObjectURL(url);\n" 
"    });\n" 
"    renderTable('');\n"
"\n"
"    // quick filters and download buttons\n"
"    function downloadFile(name, blobOrUrl){\n" 
"      if(typeof blobOrUrl === 'string'){\n" 
"        const a=document.createElement('a'); a.href=blobOrUrl; a.download=name; a.click();\n" 
"      } else {\n" 
"        const url = URL.createObjectURL(blobOrUrl); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);\n" 
"      }\n" 
"    }\n" 
"    document.getElementById('downloadNodes').addEventListener('click', ()=>{ downloadFile('nodes.csv', '" + nodes_csv + "'); });\n" 
"    document.getElementById('downloadEdges').addEventListener('click', ()=>{ downloadFile('edges.csv', '" + edges_csv + "'); });\n"
"\n"
"    // Top lists\n"
"    function showTop(list){\n" 
"      const wrap = document.getElementById('metricsList'); wrap.innerHTML='';\n" 
"      list.slice(0,10).forEach(r=>{\n" 
"        const d = document.createElement('div'); d.className='small'; d.innerHTML=`<a href='${r.url}' target='_blank' rel='noreferrer noopener'>${r.url}</a> — in:${r.in_degree} out:${r.out_degree} pr:${(+r.pagerank).toFixed(5)}`;\n" 
"        wrap.appendChild(d);\n" 
"      });\n" 
"      // scroll table to first item\n" 
"      if(list.length) document.querySelector('#nodeTable tbody tr td a[href=\"'+list[0].url+'\"]').scrollIntoView({behavior:'smooth', block:'center'});\n" 
"    }\n" 
"    document.getElementById('showTopPR').addEventListener('click', ()=> showTop(js.top_pr));\n" 
"    document.getElementById('showTopIn').addEventListener('click', ()=> showTop(js.top_in));\n" 
"    document.getElementById('showTopOut').addEventListener('click', ()=> showTop(js.top_out));\n"
"\n"
"    // Graph actions: build and filter\n"
"    let network = null; let currentNodes = []; let currentEdges = [];\n" 
"    function buildNetwork(nodes, edges){\n" 
"      const container = document.getElementById('network'); container.innerHTML = '';\n" 
"      const nset = new vis.DataSet(nodes.map(n=>Object.assign({shape:'dot', value: Math.max(5, Math.round(Math.sqrt((n.degree||1))*6))}, n)));\n" 
"      const eset = new vis.DataSet(edges.map(e=>({from:e['from'], to:e['to'], arrows:'to'})));\n" 
"      const data = {nodes: nset, edges: eset};\n" 
"      const options = {nodes:{scaling:{min:5,max:40}, font:{size:12}}, edges:{smooth:{type:'force'}}, physics:{stabilization:true,barnesHut:{gravitationalConstant:-8000}}, interaction:{hover:true, navigationButtons:true}};\n" 
"      network = new vis.Network(container, data, options);\n" 
"      network.on('doubleClick', params => { if(params.nodes && params.nodes.length){ const url = params.nodes[0]; window.open(url,'_blank'); }});\n" 
"    }\n"
"    function applyFilter(){\n" 
"      const minDeg = parseInt(document.getElementById('minDegree').value || 0);\n" 
"      const maxN = parseInt(document.getElementById('maxNodes').value || 200);\n" 
"      // filter nodes by degree and sort by degree+pagerank\n" 
"      const nodesFiltered = js.graph_nodes.filter(n => (n.degree||0) >= minDeg);\n" 
"      nodesFiltered.sort((a,b)=> (b.degree||0)+(b.pagerank||0) - ((a.degree||0)+(a.pagerank||0)) );\n" 
"      const chosen = nodesFiltered.slice(0, Math.max(10, Math.min(maxN, nodesFiltered.length)));\n" 
"      const chosenIds = new Set(chosen.map(d=>d.id));\n" 
"      const edgesFiltered = js.graph_edges.filter(e => chosenIds.has(e.from) && chosenIds.has(e.to));\n" 
"      buildNetwork(chosen, edgesFiltered);\n" 
"    }\n" 
"    document.getElementById('applyFilter').addEventListener('click', applyFilter);\n" 
"    document.getElementById('resetGraph').addEventListener('click', ()=>{ document.getElementById('minDegree').value = 0; document.getElementById('maxNodes').value = 200; applyFilter(); });\n"
"    // initial build\n" 
"    if(js.graph_nodes && js.graph_nodes.length){ applyFilter(); } else { document.getElementById('network').innerHTML = '<p class=\"muted\" style=\"padding:16px\">No graph data available. Re-run crawler with edge collection enabled.</p>' }\n"
"\n"
"  </script>\n"
"</body>\n"
"</html>\n"
)

# ---------- write and preview ----------
with open(output_html, "w", encoding="utf-8") as fh:
    fh.write(html)
print(f"Wrote advanced interactive report: {output_html}")
try:
    from IPython.display import IFrame, display
    display(IFrame(output_html, width="100%", height=900))
except Exception:
    print("Open the file in a browser to view the interactive report.")