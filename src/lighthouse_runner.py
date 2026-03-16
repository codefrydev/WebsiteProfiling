"""
Run Lighthouse locally via CLI for a given URL; return machine-readable summary with median metrics.
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


# Lighthouse "good" thresholds for human summary
LCP_GOOD_MS = 2500
CLS_GOOD = 0.1
TBT_GOOD_MS = 200
FCP_GOOD_MS = 1800


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


def run_lighthouse_once(
    url: str,
    strategy: str,
    output_path: str,
) -> subprocess.CompletedProcess:
    """Run lighthouse CLI once; output JSON to output_path. strategy is 'mobile' or 'desktop'."""
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
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300,
    )


def extract_from_lighthouse_json(data: dict) -> dict[str, Any]:
    """Extract LCP, CLS, TBT, FCP, category scores, and top 10 failing audits from Lighthouse JSON."""
    out: dict[str, Any] = {
        "lcp_ms": None,
        "cls": None,
        "tbt_ms": None,
        "fcp_ms": None,
        "performance_score": None,
        "accessibility_score": None,
        "seo_score": None,
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
    ]:
        a = audits.get(audit_id)
        if a is not None and "numericValue" in a:
            out[key] = a["numericValue"]

    for cat_id, key in [
        ("performance", "performance_score"),
        ("accessibility", "accessibility_score"),
        ("seo", "seo_score"),
    ]:
        c = cats.get(cat_id)
        if c is not None and "score" in c:
            out[key] = c["score"]

    failures = []
    for aid, a in audits.items():
        if a is None:
            continue
        score = a.get("score")
        if score is None:
            continue
        if score < 1:
            failures.append({
                "id": aid,
                "score": score,
                "helpText": a.get("helpText") or "",
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
) -> dict[str, Any]:
    """
    Run Lighthouse `iterations` times, save raw JSONs to output_dir, compute median metrics,
    and return a summary dict. Raises RuntimeError on missing lighthouse or run/parse failure.
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
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    url_slug = _url_safe(url)

    raw_paths: list[str] = []
    runs: list[dict[str, Any]] = []

    for i in range(iterations):
        out_name = f"lighthouse_{url_slug}_{ts}_run{i + 1}.json"
        out_path = os.path.join(output_dir, out_name)
        proc = run_lighthouse_once(url, strategy, out_path)
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

    # Medians
    lcps = [r["lcp_ms"] for r in runs if r["lcp_ms"] is not None]
    clss = [r["cls"] for r in runs if r["cls"] is not None]
    tbts = [r["tbt_ms"] for r in runs if r["tbt_ms"] is not None]
    fcps = [r["fcp_ms"] for r in runs if r["fcp_ms"] is not None]
    perfs = [r["performance_score"] for r in runs if r["performance_score"] is not None]
    accs = [r["accessibility_score"] for r in runs if r["accessibility_score"] is not None]
    seos = [r["seo_score"] for r in runs if r["seo_score"] is not None]

    median_metrics = {
        "lcp_ms": median_or_none(lcps),
        "cls": median_or_none(clss),
        "tbt_ms": median_or_none(tbts),
        "fcp_ms": median_or_none(fcps),
        "performance_score": median_or_none(perfs),
        "accessibility_score": median_or_none(accs),
        "seo_score": median_or_none(seos),
    }

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

    summary = {
        "url": url,
        "strategy": strategy,
        "iterations": iterations,
        "median_metrics": median_metrics,
        "top_failures": top_failures,
        "raw_reports": raw_paths,
        "run_timestamp": datetime.now(timezone.utc).isoformat(),
        "human_summary": human_summary,
    }
    return summary


def main(
    url: str,
    strategy: str = "mobile",
    iterations: int = 3,
    output_dir: str = ".",
    summary_path: str | None = None,
    db_path: str | None = None,
) -> int:
    """
    Run Lighthouse audit and write summary to JSON file and/or SQLite. Returns 0 on success, non-zero on error.
    If summary_path is None and not db_path, writes to output_dir/lighthouse_summary.json.
    """
    try:
        summary = run_lighthouse_audit(
            url=url,
            strategy=strategy,
            iterations=iterations,
            output_dir=output_dir,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    if db_path:
        from .db import get_connection, init_schema, write_lighthouse_summary, write_lighthouse_run
        conn = get_connection(db_path)
        init_schema(conn)
        write_lighthouse_summary(conn, summary)
        # Save each raw Lighthouse run report to DB, then delete the JSON file
        for i, raw_path in enumerate(summary.get("raw_reports") or []):
            if os.path.isfile(raw_path):
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
        print(summary.get("human_summary", ""))
        print(f"Summary and run reports written to SQLite: {db_path}")
    else:
        out_file = summary_path or os.path.join(output_dir, "lighthouse_summary.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, default=str)
        print(summary.get("human_summary", ""))
        print(f"Summary written to {out_file}")
    return 0
