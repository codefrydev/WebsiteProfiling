"""Auto-sync GSC Links snapshots for link velocity tracking."""
from __future__ import annotations

import json
from typing import Any


def snapshot_gsc_links(property_id: int, gsc_links_data: dict[str, Any]) -> None:
    """Store referring domain count snapshot for velocity charts."""
    from ...db.storage import db_session

    domains = gsc_links_data.get("top_linking_sites") or []
    count = len(domains)
    top = [
        # top_linking_sites entries use the "link_count" key (see gsc_links_csv.py).
        {"site": d.get("site"), "links": d.get("link_count")}
        for d in domains[:50]
        if isinstance(d, dict)
    ]
    with db_session() as conn:
        conn.execute(
            """INSERT INTO gsc_links_snapshots (property_id, referring_domains, top_domains)
               VALUES (%s, %s, %s)""",
            (property_id, count, json.dumps(top)),
        )
        conn.commit()


def check_stale_gsc_links_imports(max_age_days: int = 7) -> list[dict[str, Any]]:
    """Properties whose last GSC Links import is older than max_age_days."""
    from ...db.storage import db_session

    stale: list[dict[str, Any]] = []
    with db_session() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.name, MAX(g.fetched_at) AS last_import
            FROM properties p
            LEFT JOIN gsc_links_data g ON g.property_id = p.id
            GROUP BY p.id, p.name
            """
        )
        for row in cur.fetchall() or []:
            prop_id = row[0] if not hasattr(row, "keys") else row["id"]
            name = row[1] if not hasattr(row, "keys") else row["name"]
            last = row[2] if not hasattr(row, "keys") else row["last_import"]
            if last is None:
                stale.append({
                    "property_id": int(prop_id),
                    "name": name,
                    "message": "No GSC Links import yet — upload CSV from Search Console → Links.",
                    "severity": "medium",
                })
                continue
            try:
                from datetime import datetime, timezone

                if hasattr(last, "isoformat"):
                    imported = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
                else:
                    imported = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - imported).days
                if age_days >= max_age_days:
                    stale.append({
                        "property_id": int(prop_id),
                        "name": name,
                        "message": f"GSC Links import is {age_days} days old — re-import for velocity accuracy.",
                        "severity": "low",
                        "last_import": imported.isoformat(),
                    })
            except Exception:
                continue
    return stale
