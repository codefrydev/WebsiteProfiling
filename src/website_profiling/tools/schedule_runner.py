"""Check properties.schedule_cron and spawn audit jobs."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def _cron_dow(now: datetime) -> int:
    """Standard cron weekday: Sunday=0 … Saturday=6."""
    return (now.weekday() + 1) % 7


def _cron_field_matches(field: str, value: int) -> bool:
    """True if *value* matches a cron field of '*' or a comma list of integers."""
    if field == "*":
        return True
    allowed = {part.strip() for part in field.split(",") if part.strip()}
    return str(value) in allowed


def _cron_matches(cron_expr: str, now: datetime) -> bool:
    """Minimal cron matcher (UTC): 'MIN HOUR DOM MONTH DOW', '*' or comma lists.

    Day-of-month and month are honoured (previously ignored, which made e.g.
    ``0 9 1 * *`` fire every day instead of only on the 1st). DOM and DOW follow
    standard cron OR-semantics: when both are restricted, the day matches if
    EITHER matches; an unparseable field fails closed (no match).
    """
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        return False
    minute, hour, dom, month, dow = parts
    try:
        if minute != "*" and int(minute) != now.minute:
            return False
        if hour != "*" and int(hour) != now.hour:
            return False
        # Validate the remaining fields up front so a malformed token fails closed.
        for field in (dom, month, dow):
            for part in field.split(","):
                part = part.strip()
                if part and part != "*":
                    int(part)
    except ValueError:
        return False

    if not _cron_field_matches(month, now.month):
        return False

    dom_restricted = dom != "*"
    dow_restricted = dow != "*"
    dom_ok = _cron_field_matches(dom, now.day)
    dow_ok = _cron_field_matches(dow, _cron_dow(now))
    if dom_restricted and dow_restricted:
        return dom_ok or dow_ok
    if dom_restricted:
        return dom_ok
    if dow_restricted:
        return dow_ok
    return True


def _repo_root() -> str:
    explicit = (os.environ.get("WEBSITE_PROFILING_ROOT") or "").strip()
    if explicit:
        return explicit
    # src/website_profiling/tools/schedule_runner.py -> repo root
    return str(Path(__file__).resolve().parents[3])


def _spawn_audit_for_property(prop_id: int, conn) -> None:
    """Spawn audit for one property. Never writes to pipeline_config."""
    from ..db.property_store import get_property_by_id

    prop = get_property_by_id(conn, int(prop_id))
    if not prop:
        print(f"[Schedule] Property {prop_id} not found — skipped", flush=True)
        return

    site_url = str(prop.get("site_url") or "").strip()
    repo_root = _repo_root()
    env = {
        **os.environ,
        "WP_PROPERTY_ID": str(prop_id),
        "WP_SCHEDULED_SPAWN": "1",
        "WEBSITE_PROFILING_ROOT": repo_root,
        "PYTHONPATH": os.path.join(repo_root, "src"),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }
    subprocess.Popen(
        [sys.executable, "-m", "src"],
        env=env,
        cwd=repo_root,
    )
    print(
        f"[Schedule] Spawned audit for property {prop_id} ({site_url or 'no site_url'})",
        flush=True,
    )


def run_due_scheduled_audits() -> int:
    from ..db.storage import db_session

    now = datetime.now(timezone.utc)
    started = 0
    matched: list[int] = []
    with db_session() as conn:
        cur = conn.execute(
            "SELECT id, name, schedule_cron FROM properties WHERE schedule_cron IS NOT NULL AND trim(schedule_cron) != ''"
        )
        rows = cur.fetchall() or []
        for row in rows:
            prop_id = row[0] if not hasattr(row, "keys") else row["id"]
            cron = row[2] if not hasattr(row, "keys") else row["schedule_cron"]
            if not cron or not _cron_matches(str(cron), now):
                continue
            matched.append(int(prop_id))

        if len(matched) > 1:
            print(
                f"[Schedule] {len(matched)} properties due this minute — spawning sequentially",
                flush=True,
            )
        for prop_id in matched:
            print(f"[Schedule] Starting audit for property {prop_id}", flush=True)
            _spawn_audit_for_property(prop_id, conn)
            started += 1
    return started


def run_gsc_links_staleness_alerts() -> list[dict]:
    from ..integrations.google.gsc_links_sync import check_stale_gsc_links_imports

    return check_stale_gsc_links_imports()


def main() -> None:
    from ..console_io import configure_stdio

    configure_stdio()
    n = run_due_scheduled_audits()
    stale = run_gsc_links_staleness_alerts()
    print(f"Started {n} scheduled audit(s).")
    if stale:
        print(f"GSC Links stale/missing for {len(stale)} propert(ies).", flush=True)
        for item in stale[:20]:
            print(f"  - [{item.get('property_id')}] {item.get('message')}", flush=True)


if __name__ == "__main__":
    main()
