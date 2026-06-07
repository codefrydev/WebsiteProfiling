"""CLI: chat --stdin-json — agent turn for in-app chat (NDJSON events on stdout)."""
from __future__ import annotations

import argparse
import json
import sys

from ..tools.audit_tools import AuditToolContext
from ..llm.agent import run_agent_turn


def run(_cfg: dict, args: argparse.Namespace) -> None:
    if not getattr(args, "stdin_json", False):
        print("Error: chat requires --stdin-json", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"type": "error", "message": f"Invalid stdin JSON: {e}"}))
        sys.exit(1)

    messages = payload.get("messages") or []
    if not isinstance(messages, list):
        messages = []

    property_id = payload.get("property_id")
    report_id = payload.get("report_id")
    try:
        pid = int(property_id) if property_id is not None else None
    except (TypeError, ValueError):
        pid = None
    try:
        rid = int(report_id) if report_id is not None else None
    except (TypeError, ValueError):
        rid = None

    ctx = AuditToolContext(property_id=pid, report_id=rid)

    def on_event(event: dict) -> None:
        print(json.dumps(event, default=str), flush=True)

    result = run_agent_turn(messages, ctx, on_event=on_event)
    if not result.get("ok"):
        print(json.dumps({"type": "error", "message": result.get("error", "Agent failed")}), flush=True)
        sys.exit(1)
    sys.exit(0)
