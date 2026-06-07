"""Execution context for audit tools (property + report scope)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from psycopg import Connection

from ...db.crawl_store import get_latest_crawl_run_id, read_crawl
from ...db.report_store import read_report_payload
from ...integrations.google.keyword_store import read_latest_keyword_data
from ...integrations.google.store import read_latest_google_data


@dataclass
class AuditToolContext:
    property_id: Optional[int] = None
    report_id: Optional[int] = None

    def load_payload(self, conn: Connection) -> dict[str, Any]:
        payload = read_report_payload(conn, self.report_id)
        return payload if isinstance(payload, dict) else {}

    def load_crawl_df(self, conn: Connection):
        payload = self.load_payload(conn)
        run_id = payload.get("crawl_run_id")
        try:
            rid = int(run_id) if run_id is not None else None
        except (TypeError, ValueError):
            rid = None
        if rid is None:
            rid = get_latest_crawl_run_id(conn)
        return read_crawl(conn, rid)

    def load_google(self, conn: Connection) -> Optional[dict[str, Any]]:
        google = read_latest_google_data(conn, self.property_id)
        if google:
            return google
        payload = self.load_payload(conn)
        embedded = payload.get("google")
        return embedded if isinstance(embedded, dict) else None

    def load_keywords(self, conn: Connection) -> Optional[dict[str, Any]]:
        kw = read_latest_keyword_data(conn, self.property_id)
        if kw:
            return kw
        payload = self.load_payload(conn)
        embedded = payload.get("keywords")
        return embedded if isinstance(embedded, dict) else None

    def with_args(self, args: dict[str, Any]) -> AuditToolContext:
        """Merge tool args property_id/report_id when provided."""
        pid = args.get("property_id")
        rid = args.get("report_id")
        new_pid = self.property_id
        new_rid = self.report_id
        if pid is not None:
            try:
                new_pid = int(pid)
            except (TypeError, ValueError):
                pass
        if rid is not None:
            try:
                new_rid = int(rid)
            except (TypeError, ValueError):
                pass
        return AuditToolContext(property_id=new_pid, report_id=new_rid)
