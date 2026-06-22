"""Export audit payload to CSV and JSON."""
from __future__ import annotations

import csv
import io
import json
from typing import Optional

from ..db import db_session, read_report_payload
from .export_audit_data import (
    _executive_export_data,
    _executive_source_label,
    _issue_recommendation,
    _issues_rows,
)


def _load_payload(report_id: Optional[int] = None) -> dict:
    """Load report payload from DB (uses module-level db_session for test patches)."""
    with db_session() as conn:
        payload = read_report_payload(conn, report_id)
    if not payload:
        raise FileNotFoundError("No report payload found")
    return payload


def export_audit_csv(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["# Site Audit export"])
    w.writerow(["site_name", payload.get("site_name", "")])
    w.writerow(["report_generated_at", payload.get("report_generated_at", "")])
    meta = payload.get("report_meta") or {}
    if meta:
        w.writerow(["data_sources", ", ".join(meta.get("data_sources") or [])])
    w.writerow([])
    w.writerow(["url", "status", "title", "inlinks", "word_count"])
    for link in payload.get("links") or []:
        if not isinstance(link, dict):
            continue
        w.writerow([
            link.get("url", ""),
            link.get("status", ""),
            link.get("title", ""),
            link.get("inlinks", ""),
            link.get("word_count", ""),
        ])
    exec_data = _executive_export_data(payload)
    if exec_data["summary"] or exec_data["priorities"]:
        w.writerow([])
        w.writerow(["# Executive summary"])
        w.writerow(["source", _executive_source_label(exec_data["source"])])
        if exec_data["summary"]:
            w.writerow(["summary", exec_data["summary"]])
        for i, pri in enumerate(exec_data["priorities"], 1):
            w.writerow([f"priority_{i}", pri])
    w.writerow([])
    w.writerow(["category", "priority", "message", "url", "recommendation", "llm_recommendation"])
    for row in _issues_rows(payload):
        w.writerow([
            row["category"],
            row["priority"],
            row["message"],
            row["url"],
            row["recommendation"],
            row.get("llm_recommendation", ""),
        ])
    return buf.getvalue()


def export_audit_json(report_id: Optional[int] = None) -> str:
    payload = _load_payload(report_id)
    return json.dumps(payload, indent=2, default=str)
