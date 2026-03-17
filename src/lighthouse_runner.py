"""
Run Lighthouse locally via CLI for a given URL; return machine-readable summary with median metrics.
Writes raw_runs/, summary.json, diagnostics.json, human_summary.txt, and optionally report.html.
Uses global lighthouse if on PATH, otherwise runs via npx (which will install it automatically).
Requires: Node + npm, Chrome/Chromium.
"""
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from . import warning_mapper


# Lighthouse "good" thresholds for human summary
LCP_GOOD_MS = 2500
CLS_GOOD = 0.1
TBT_GOOD_MS = 200
FCP_GOOD_MS = 1800


def _build_report_html_content(summary: dict[str, Any]) -> str:
    """Build report.html content (for DB or file). Returns HTML string."""
    import html as html_module
    mm = summary.get("median_metrics") or {}
    cs = summary.get("category_scores") or {}
    failures = summary.get("top_failures") or []
    raw_reports = summary.get("raw_reports") or []
    url = html_module.escape(summary.get("url", ""))
    path_summary = "summary.json"
    path_human = "human_summary.txt"
    path_diag = "diagnostics.json"
    raw_dir = "raw_runs"
    rows_fail = "".join(
        f"<tr><td>{html_module.escape(str(f.get('id', '')))}</td><td>{html_module.escape(str(f.get('impact', '')))}</td><td>{html_module.escape(str(f.get('helpText', ''))[:80])}...</td></tr>"
        for f in failures[:10]
    ) or "<tr><td colspan=\"3\">None</td></tr>"
    raw_links = "".join(f"<a href=\"{raw_dir}/{os.path.basename(p)}\">{os.path.basename(p)}</a> " for p in raw_reports[:5])
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Lighthouse Report</title></head>
<body style="font-family:sans-serif; max-width:800px; margin:2em auto; padding:1em;">
<h1>Lighthouse Report</h1>
<p>URL: <a href="{url}">{url}</a></p>
<h2>Median metrics</h2>
<table border="1" cellpadding="6">
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>LCP (ms)</td><td>{mm.get('lcp_ms') or '—'}</td></tr>
<tr><td>CLS</td><td>{mm.get('cls') or '—'}</td></tr>
<tr><td>TBT (ms)</td><td>{mm.get('tbt_ms') or '—'}</td></tr>
<tr><td>FCP (ms)</td><td>{mm.get('fcp_ms') or '—'}</td></tr>
</table>
<h2>Category scores (0–100)</h2>
<table border="1" cellpadding="6">
<tr><th>Category</th><th>Score</th></tr>
<tr><td>performance</td><td>{cs.get('performance') or '—'}</td></tr>
<tr><td>accessibility</td><td>{cs.get('accessibility') or '—'}</td></tr>
<tr><td>best-practices</td><td>{cs.get('best-practices') or '—'}</td></tr>
<tr><td>seo</td><td>{cs.get('seo') or '—'}</td></tr>
<tr><td>pwa</td><td>{cs.get('pwa') or '—'}</td></tr>
</table>
<h2>Top failures</h2>
<table border="1" cellpadding="6"><tr><th>Audit</th><th>Impact</th><th>Help</th></tr>{rows_fail}</table>
<h2>Artifacts</h2>
<p><a href="{path_summary}">summary.json</a> | <a href="{path_human}">human_summary.txt</a> | <a href="{path_diag}">diagnostics.json</a></p>
<p>Raw runs: {raw_links or '—'}</p>
</body>
</html>
"""


def _write_report_html(output_dir: str, summary: dict[str, Any]) -> None:
    """Write report.html to output_dir (used when not using DB)."""
    content = summary.get("report_html") or _build_report_html_content(summary)
    report_path = os.path.join(output_dir, "report.html")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(content)


def _url_safe(s: str) -> str:
    """Return a filesystem-safe slug from URL for filenames."""
    return re.sub(r"[^\w\-.]", "_", s.strip().rstrip("/"))[:80]


def _lighthouse_cmd() -> list[str]:
    """Return the command to run Lighthouse: [lighthouse] or [npx, -y, lighthouse]. Raises RuntimeError if neither is available."""
    if shutil.which("lighthouse") is not None:
        return ["lighthouse"]
    if shutil.which("npx") is not None:
        return ["npx", "-y", "lighthouse"]
    raise RuntimeError(
        "Lighthouse not found. Install Node/npm (https://nodejs.org), then run: npm install -g lighthouse. "
        "Chrome or Chromium is also required for headless mode."
    )


def is_lighthouse_available() -> bool:
    """Return True if lighthouse or npx is on PATH (so we can run Lighthouse)."""
    return shutil.which("lighthouse") is not None or shutil.which("npx") is not None


def _preset_for_strategy(strategy: str) -> str:
    """Map user strategy 'mobile'|'desktop' to Lighthouse CLI preset. Newer Lighthouse only accepts perf, experimental, desktop."""
    s = (strategy or "mobile").lower()
    if s == "desktop":
        return "desktop"
    return "perf"  # mobile -> perf (mobile-like throttling in current Lighthouse)


# Valid Lighthouse category IDs for --only-categories
LIGHTHOUSE_CATEGORY_IDS = {"performance", "accessibility", "best-practices", "seo", "pwa"}


def _parse_categories(categories: str | list[str] | None) -> list[str] | None:
    """Return list of valid category IDs, or None to run all categories."""
    if categories is None:
        return None
    if isinstance(categories, str):
        categories = [c.strip().lower() for c in categories.split(",") if c.strip()]
    if not categories:
        return None
    out = [c for c in categories if c in LIGHTHOUSE_CATEGORY_IDS]
    return out if out else None


def run_lighthouse_once(
    url: str,
    strategy: str,
    output_path: str,
    categories: list[str] | None = None,
) -> subprocess.CompletedProcess:
    """Run lighthouse CLI once; output JSON to output_path. strategy is 'mobile' or 'desktop'. categories: optional list for --only-categories."""
    base = _lighthouse_cmd()
    preset = _preset_for_strategy(strategy)
    cmd = base + [
        url,
        "--output=json",
        f"--output-path={output_path}",
        "--chrome-flags=--headless",
        f"--preset={preset}",
        "--quiet",
    ]
    if categories:
        cmd.append("--only-categories=" + ",".join(categories))
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _evidence_from_audit(audit: dict[str, Any]) -> list[str]:
    """Extract resource URLs or selectors from audit details."""
    evidence: list[str] = []
    details = audit.get("details")
    if not details or not isinstance(details, dict):
        return evidence
    items = details.get("items") or details.get("nodes") or []
    if not isinstance(items, list):
        return evidence
    for item in items[:5]:
        if isinstance(item, dict):
            url = item.get("url")
            if url and isinstance(url, str) and not str(url).startswith("data:"):
                evidence.append(str(url)[:500])
            node = item.get("node")
            if isinstance(node, dict) and node.get("selector"):
                evidence.append(str(node["selector"])[:200])
            if item.get("selector"):
                evidence.append(str(item["selector"])[:200])
    return evidence[:15]


def extract_from_lighthouse_json(data: dict) -> dict[str, Any]:
    """Extract LCP, CLS, TBT, FCP, Speed Index, category scores (all 5), and top 10 failing audits with impact and evidence."""
    out: dict[str, Any] = {
        "lcp_ms": None,
        "cls": None,
        "tbt_ms": None,
        "fcp_ms": None,
        "speed_index_ms": None,
        "performance_score": None,
        "accessibility_score": None,
        "seo_score": None,
        "best_practices_score": None,
        "pwa_score": None,
        "category_scores": {},
        "top_failures": [],
    }
    lr = data.get("lighthouseResult") or data
    audits = lr.get("audits") or {}
    cats = lr.get("categories") or {}

    for audit_id, key in [
        ("largest-contentful-paint", "lcp_ms"),
        ("cumulative-layout-shift", "cls"),
        ("total-blocking-time", "tbt_ms"),
        ("first-contentful-paint", "fcp_ms"),
        ("speed-index", "speed_index_ms"),
    ]:
        a = audits.get(audit_id)
        if a is not None and "numericValue" in a:
            out[key] = a["numericValue"]

    for cat_id, key in [
        ("performance", "performance_score"),
        ("accessibility", "accessibility_score"),
        ("seo", "seo_score"),
        ("best-practices", "best_practices_score"),
        ("pwa", "pwa_score"),
    ]:
        c = cats.get(cat_id)
        if c is not None and "score" in c:
            s = c["score"]
            out[key] = s
            out["category_scores"][cat_id] = round((s * 100)) if s is not None else None

    # Resolve impact from warning_mapper for each failure
    from .warning_mapper import resolve_impact
    failures = []
    for aid, a in audits.items():
        if a is None:
            continue
        score = a.get("score")
        if score is None:
            continue
        if score < 1:
            title = a.get("title") or aid
            help_text = a.get("helpText") or ""
            impact = resolve_impact(aid, title, help_text)
            evidence = _evidence_from_audit(a)
            failures.append({
                "id": aid,
                "score": score,
                "helpText": help_text,
                "impact": impact,
                "evidence": evidence,
            })
    failures.sort(key=lambda x: (x["score"] or 0))
    out["top_failures"] = failures[:10]

    return out


def median_or_none(values: list[float]) -> float | None:
    """Return median of list; None if empty or all None."""
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return statistics.median(clean)


def run_lighthouse_audit(
    url: str,
    strategy: str = "mobile",
    iterations: int = 3,
    output_dir: str = ".",
    mode: str = "navigation",
    categories: str | list[str] | None = None,
) -> dict[str, Any]:
    """
    Run Lighthouse `iterations` times, save raw JSONs to output_dir, compute median metrics,
    and return a summary dict. mode: 'navigation' (default), 'timespan', or 'snapshot'.
    categories: optional comma-separated or list of category IDs for --only-categories.
    """
    if not is_lighthouse_available():
        raise RuntimeError(
            "Node/npm not found. Install Node.js (https://nodejs.org); then run: npm install -g lighthouse. "
            "Chrome or Chromium is also required for headless mode."
        )
    strategy = strategy.lower() if strategy else "mobile"
    if strategy not in ("mobile", "desktop"):
        strategy = "mobile"
    iterations = max(1, int(iterations))
    print(f"Lighthouse audit: {url} (strategy={strategy}, iterations={iterations})", flush=True)
    os.makedirs(output_dir, exist_ok=True)
    raw_runs_dir = os.path.join(output_dir, "raw_runs")
    os.makedirs(raw_runs_dir, exist_ok=True)
    print("  Output directory ready.", flush=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    url_slug = _url_safe(url)

    raw_paths: list[str] = []
    runs: list[dict[str, Any]] = []

    categories = _parse_categories(categories) if categories else None
    if categories:
        print(f"  Categories: {', '.join(categories)}", flush=True)

    for i in range(iterations):
        print(f"  Lighthouse run {i + 1}/{iterations} ({strategy})...", flush=True)
        out_name = f"lighthouse_{url_slug}_{ts}_run{i + 1}.json"
        out_path = os.path.join(raw_runs_dir, out_name)
        proc = run_lighthouse_once(url, strategy, out_path, categories=categories)
        if proc.returncode != 0:
            raise RuntimeError(
                f"Lighthouse run failed (exit {proc.returncode}): {proc.stderr or proc.stdout or 'unknown'}"
            )
        if not os.path.isfile(out_path):
            raise RuntimeError(f"Lighthouse did not write output: {out_path}")
        raw_paths.append(out_path)
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            raise RuntimeError(f"Failed to parse Lighthouse JSON {out_path}: {e}") from e
        runs.append(extract_from_lighthouse_json(data))
        print(f"  Run {i + 1}/{iterations} done.", flush=True)

    print("  Computing medians and category scores...", flush=True)
    # Medians
    lcps = [r["lcp_ms"] for r in runs if r["lcp_ms"] is not None]
    clss = [r["cls"] for r in runs if r["cls"] is not None]
    tbts = [r["tbt_ms"] for r in runs if r["tbt_ms"] is not None]
    fcps = [r["fcp_ms"] for r in runs if r["fcp_ms"] is not None]
    speed_idx = [r.get("speed_index_ms") for r in runs if r.get("speed_index_ms") is not None]
    perfs = [r["performance_score"] for r in runs if r["performance_score"] is not None]
    accs = [r["accessibility_score"] for r in runs if r["accessibility_score"] is not None]
    seos = [r["seo_score"] for r in runs if r["seo_score"] is not None]
    bps = [r.get("best_practices_score") for r in runs if r.get("best_practices_score") is not None]
    pwas = [r.get("pwa_score") for r in runs if r.get("pwa_score") is not None]

    median_metrics = {
        "lcp_ms": median_or_none(lcps),
        "cls": median_or_none(clss),
        "tbt_ms": median_or_none(tbts),
        "fcp_ms": median_or_none(fcps),
        "speed_index_ms": median_or_none(speed_idx),
        "performance_score": median_or_none(perfs),
        "accessibility_score": median_or_none(accs),
        "seo_score": median_or_none(seos),
        "best_practices_score": median_or_none(bps),
        "pwa_score": median_or_none(pwas),
    }
    _cat_key = {"performance": "performance_score", "accessibility": "accessibility_score", "best-practices": "best_practices_score", "seo": "seo_score", "pwa": "pwa_score"}
    category_scores = {}
    for cat_id in ("performance", "accessibility", "best-practices", "seo", "pwa"):
        val = median_metrics.get(_cat_key[cat_id])
        category_scores[cat_id] = round(val * 100) if val is not None else None

    # Merge top failures from run with worst performance score
    worst_run = min(runs, key=lambda r: (r["performance_score"] is None, -(r["performance_score"] or 0)))
    top_failures = worst_run.get("top_failures") or []

    lcp_ok = median_metrics["lcp_ms"] is not None and median_metrics["lcp_ms"] <= LCP_GOOD_MS
    cls_ok = median_metrics["cls"] is not None and median_metrics["cls"] <= CLS_GOOD
    tbt_ok = median_metrics["tbt_ms"] is not None and median_metrics["tbt_ms"] <= TBT_GOOD_MS
    parts = []
    if median_metrics["lcp_ms"] is not None:
        parts.append(f"LCP {'meets' if lcp_ok else 'exceeds'} good threshold (≤{LCP_GOOD_MS}ms).")
    if median_metrics["cls"] is not None:
        parts.append(f"CLS {'meets' if cls_ok else 'exceeds'} good threshold (≤{CLS_GOOD}).")
    if median_metrics["tbt_ms"] is not None:
        parts.append(f"TBT {'meets' if tbt_ok else 'exceeds'} good threshold (≤{TBT_GOOD_MS}ms).")
    human_summary = " ".join(parts) if parts else "No Core Web Vitals metrics extracted."

    # Diagnostics from first raw run (full Lighthouse JSON)
    print("  Building diagnostics from audit results...", flush=True)
    diagnostics: list[dict[str, Any]] = []
    first_raw = raw_paths[0] if raw_paths else None
    if first_raw and os.path.isfile(first_raw):
        try:
            with open(first_raw, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            from .warning_mapper import parse_lighthouse_to_diagnostics
            diagnostics = parse_lighthouse_to_diagnostics(raw_data)[:15]
        except Exception:
            pass
    print(f"  Found {len(diagnostics)} diagnostics.", flush=True)

    # Human summary for file: CWV verdict + Top 5 fixes + quick wins (<400 words)
    human_lines = [human_summary, ""]
    if diagnostics:
        high = [d for d in diagnostics if d.get("severity") == "High"]
        high.sort(key=lambda d: ("LCP", "CLS", "FID", "Accessibility", "SEO", "UX").index(d.get("primary_impact", "UX")) if d.get("primary_impact") in ("LCP", "CLS", "FID", "Accessibility", "SEO", "UX") else 99)
        top5 = high[:5] if high else diagnostics[:5]
        human_lines.append("Top 5 fixes (priority order):")
        for i, d in enumerate(top5, 1):
            human_lines.append(f"  {i}. {(d.get('one_line_fix') or '')[:120]}")
        human_lines.append("")
    human_lines.append("Quick wins checklist: preload LCP image; inline critical CSS; add width/height to images; defer non-critical JS; set Cache-Control.")
    human_summary_full = "\n".join(human_lines)

    summary = {
        "url": url,
        "mode": mode or "navigation",
        "strategy": strategy,
        "device": strategy,
        "categories": categories or list(LIGHTHOUSE_CATEGORY_IDS),
        "iterations": iterations,
        "median_metrics": median_metrics,
        "category_scores": category_scores,
        "top_failures": top_failures,
        "raw_reports": raw_paths,
        "run_timestamp": datetime.now(timezone.utc).isoformat(),
        "human_summary": human_summary,
        "human_summary_full": human_summary_full,
        "diagnostics": diagnostics,
    }
    return summary


def main(
    url: str,
    strategy: str = "mobile",
    iterations: int = 3,
    output_dir: str = ".",
    summary_path: str | None = None,
    db_path: str | None = None,
    mode: str = "navigation",
    categories: str | list[str] | None = None,
) -> int:
    """
    Run Lighthouse audit and write summary to JSON file and/or SQLite. Returns 0 on success, non-zero on error.
    mode: 'navigation' (default), 'timespan', or 'snapshot'. categories: optional for --only-categories.
    """
    try:
        summary = run_lighthouse_audit(
            url=url,
            strategy=strategy,
            iterations=iterations,
            output_dir=output_dir,
            mode=mode,
            categories=categories,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    # Store report HTML in summary so it is saved to DB when db_path is set
    print("  Building report HTML...", flush=True)
    summary["report_html"] = _build_report_html_content(summary)

    if db_path:
        # Persist everything to DB only (no artifact files on disk)
        from .db import get_connection, init_schema, write_lighthouse_summary, write_lighthouse_run
        print("  Saving summary to DB...", flush=True)
        conn = get_connection(db_path)
        init_schema(conn)
        write_lighthouse_summary(conn, summary)
        raw_reports = summary.get("raw_reports") or []
        for i, raw_path in enumerate(raw_reports):
            if os.path.isfile(raw_path):
                print(f"  Saving raw run {i + 1}/{len(raw_reports)} to DB...", flush=True)
                try:
                    with open(raw_path, "r", encoding="utf-8") as f:
                        run_data = json.load(f)
                    write_lighthouse_run(conn, url, strategy, i + 1, run_data)
                    try:
                        os.remove(raw_path)
                    except OSError:
                        pass
                except (OSError, json.JSONDecodeError):
                    pass
        conn.close()
        print("  Lighthouse DB write complete.", flush=True)
        print(summary.get("human_summary", ""))
        print(f"All Lighthouse data saved to SQLite: {db_path} (summary, diagnostics, human summary, report HTML, raw runs)")
    else:
        # No DB: write all artifacts to output_dir
        print("  Writing summary.json...", flush=True)
        summary_file = os.path.join(output_dir, "summary.json")
        with open(summary_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, default=str)
        print("  Writing human_summary.txt...", flush=True)
        human_file = os.path.join(output_dir, "human_summary.txt")
        with open(human_file, "w", encoding="utf-8") as f:
            f.write(summary.get("human_summary_full", summary.get("human_summary", "")))
        print("  Writing diagnostics.json...", flush=True)
        diag_file = os.path.join(output_dir, "diagnostics.json")
        with open(diag_file, "w", encoding="utf-8") as f:
            json.dump(summary.get("diagnostics", []), f, indent=2, default=str)
        print("  Writing lighthouse_summary.json...", flush=True)
        out_file = summary_path or os.path.join(output_dir, "lighthouse_summary.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, default=str)
        print("  Writing report.html...", flush=True)
        _write_report_html(output_dir, summary)
        print(summary.get("human_summary", ""))
        print(f"Summary: {summary_file}; diagnostics: {diag_file}; human summary: {human_file}")
    return 0
