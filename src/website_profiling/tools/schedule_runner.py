"""Check properties.schedule_cron and spawn audit jobs."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone


def _cron_matches(cron_expr: str, now: datetime) -> bool:
    """Minimal cron matcher: 'MIN HOUR * * DOW' (single values only)."""
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        return False
    minute, hour, _dom, _month, dow = parts
    if minute != "*" and int(minute) != now.minute:
        return False
    if hour != "*" and int(hour) != now.hour:
        return False
    if dow != "*" and str(now.weekday()) not in dow.split(","):
        return False
    return True


def _spawn_audit_for_property(prop_id: int, conn) -> None:
    from ..db.config_store import read_pipeline_config, write_pipeline_config
    from ..db.property_store import get_property_by_id

    prop = get_property_by_id(conn, int(prop_id))
    if not prop:
        print(f"[Schedule] Property {prop_id} not found — skipped", flush=True)
        return

    known, unknown = read_pipeline_config(conn)
    known["active_property_id"] = str(prop_id)
    site_url = str(prop.get("site_url") or "").strip()
    if site_url:
        known["start_url"] = site_url
    preset = str(prop.get("default_crawl_preset") or "").strip()
    if preset:
        from ..crawl_presets import apply_crawl_preset

        known = apply_crawl_preset(preset, known)
    write_pipeline_config(conn, known, unknown)

    env = {**os.environ, "WP_PROPERTY_ID": str(prop_id)}
    subprocess.Popen([sys.executable, "-m", "src"], env=env)
    print(f"[Schedule] Spawned audit for property {prop_id} ({site_url or 'no site_url'})", flush=True)


def run_due_scheduled_audits() -> int:
    from ..db.storage import db_session

    now = datetime.now(timezone.utc)
    started = 0
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
            print(f"[Schedule] Starting audit for property {prop_id} ({cron})", flush=True)
            _spawn_audit_for_property(int(prop_id), conn)
            started += 1
    return started


def run_gsc_links_staleness_alerts() -> list[dict]:
    from ..integrations.google.gsc_links_sync import check_stale_gsc_links_imports

    return check_stale_gsc_links_imports()


def main() -> None:
    n = run_due_scheduled_audits()
    stale = run_gsc_links_staleness_alerts()
    print(f"Started {n} scheduled audit(s).")
    if stale:
        print(f"GSC Links stale/missing for {len(stale)} propert(ies).", flush=True)
        for item in stale[:20]:
            print(f"  - [{item.get('property_id')}] {item.get('message')}", flush=True)


if __name__ == "__main__":
    main()
