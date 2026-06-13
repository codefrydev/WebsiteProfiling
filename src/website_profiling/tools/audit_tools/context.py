"""Execution context for audit tools (property + report scope)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from psycopg import Connection

from ...db.crawl_store import get_latest_crawl_run_id, read_crawl
from ...db.property_store import get_property_by_id
from ...db.report_store import read_report_payload
from ...integrations.google.gsc_links_store import read_latest_gsc_links_data
from ...integrations.google.keyword_store import read_latest_keyword_data
from ...integrations.google.store import (
    read_google_data_full,
    read_latest_google_data,
    read_prior_google_snapshot,
)


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

    def load_google_full(self, conn: Connection) -> Optional[dict[str, Any]]:
        full = read_google_data_full(conn, self.property_id)
        if full:
            return full
        payload = self.load_payload(conn)
        embedded = payload.get("google")
        return embedded if isinstance(embedded, dict) else None

    def load_google_pair(self, conn: Connection) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
        """Return (current, prior) full Google snapshots for decay/compare tools."""
        current = read_google_data_full(conn, self.property_id)
        prior = read_prior_google_snapshot(conn, self.property_id, skip=1)
        if current is None:
            payload = self.load_payload(conn)
            embedded = payload.get("google")
            current = embedded if isinstance(embedded, dict) else None
        return current, prior

    def load_gsc_links(self, conn: Connection) -> Optional[dict[str, Any]]:
        links = read_latest_gsc_links_data(conn, self.property_id, for_report=False)
        if links:
            return links
        payload = self.load_payload(conn)
        embedded = payload.get("gsc_links")
        return embedded if isinstance(embedded, dict) else None

    def load_report_payload_by_id(self, conn: Connection, report_id: int) -> dict[str, Any]:
        data = read_report_payload(conn, report_id)
        return data if isinstance(data, dict) else {}

    def resolve_property_domain(self, conn: Connection) -> str:
        if self.property_id is not None:
            prop = get_property_by_id(conn, int(self.property_id))
            if prop:
                domain = str(prop.get("canonical_domain") or "").strip().lower()
                if domain:
                    return domain
        payload = self.load_payload(conn)
        for key in ("canonical_domain",):
            val = str(payload.get(key) or "").strip().lower()
            if val:
                return val
        top = payload.get("top_pages") or []
        if top and isinstance(top[0], dict):
            from urllib.parse import urlparse

            host = urlparse(str(top[0].get("url") or "")).hostname
            if host:
                return host.lower()
        return ""

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
