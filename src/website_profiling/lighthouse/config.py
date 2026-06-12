"""Lighthouse CLI configuration and command helpers."""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
from pathlib import Path

# Lighthouse "good" thresholds for human summary
LCP_GOOD_MS = 2500
CLS_GOOD = 0.1
TBT_GOOD_MS = 200
FCP_GOOD_MS = 1800

_LIGHTHOUSE_INSTALL_MSG = (
    "Lighthouse not found. Install Node/npm (https://nodejs.org), then run: npm install -g lighthouse. "
    "Chrome or Chromium is also required for headless mode."
)

_NPX_LIGHTHOUSE_LOCK = threading.Lock()
_LIGHTHOUSE_FLOW_MODES = frozenset({"snapshot", "timespan"})

def _repo_root() -> str:
    explicit = (os.environ.get("WEBSITE_PROFILING_ROOT") or "").strip()
    if explicit:
        return explicit
    return str(Path(__file__).resolve().parents[3])


def _lighthouse_flow_script() -> str:
    return os.path.join(_repo_root(), "scripts", "lighthouse_user_flow.mjs")


def _normalize_lighthouse_mode(mode: str | None) -> str:
    m = (mode or "navigation").strip().lower() or "navigation"
    if m not in ("navigation", "snapshot", "timespan"):
        raise RuntimeError(
            f"Invalid lighthouse_mode {m!r}; use navigation, snapshot, or timespan."
        )
    return m


def _node_cmd() -> str:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError(
            "Node.js not found. Install Node.js (https://nodejs.org) for Lighthouse user flows."
        )
    return node


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
    """Return argv prefix: [resolved lighthouse] or [resolved npx, -y, lighthouse]. Paths from shutil.which (portable)."""
    explicit = (os.environ.get("LIGHTHOUSE_PATH") or os.environ.get("LIGHTHOUSE_BIN") or "").strip()
    if explicit and os.path.isfile(explicit) and os.access(explicit, os.X_OK):
        return [explicit]
    lh = shutil.which("lighthouse")
    if lh is not None:
        return [lh]
    npx = shutil.which("npx")
    if npx is not None:
        return [npx, "-y", "lighthouse"]
    raise RuntimeError(_LIGHTHOUSE_INSTALL_MSG)


def _uses_npx(cmd: list[str]) -> bool:
    base = os.path.basename(cmd[0]).lower()
    return base in ("npx", "npx.cmd")


def is_lighthouse_available() -> bool:
    """Return True if lighthouse or npx is on PATH (so we can run Lighthouse)."""
    try:
        _lighthouse_cmd()
        return True
    except RuntimeError:
        return False


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

