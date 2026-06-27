#!/usr/bin/env python3
"""Remove junk property rows created while typing a Site URL (partial domains)."""
from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))

from website_profiling.db.pool import db_session
from website_profiling.db.property_store import delete_property, is_valid_canonical_domain, list_properties_public


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    with db_session() as conn:
        props = list_properties_public(conn)
        junk = [p for p in props if not is_valid_canonical_domain(str(p.get("canonical_domain") or ""))]
        if not junk:
            print("No junk properties found.")
            return 0
        print(f"{'Would delete' if dry_run else 'Deleting'} {len(junk)} junk propert{'y' if len(junk) == 1 else 'ies'}:")
        for p in junk:
            print(f"  id={p['id']} domain={p.get('canonical_domain')!r}")
        if dry_run:
            return 0
        deleted = 0
        for p in junk:
            if delete_property(conn, int(p["id"])):
                deleted += 1
        print(f"Deleted {deleted} properties.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
