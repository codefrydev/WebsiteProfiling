"""CLI: help --stdin-json — single-turn help chat (NDJSON events on stdout)."""
from __future__ import annotations

import argparse
import json
import sys

from ..text_sanitize import sanitize_unicode_deep
from ..llm.help_agent import run_help_turn


def run(_cfg: dict, args: argparse.Namespace) -> None:
    if not getattr(args, "stdin_json", False):
        print("Error: help requires --stdin-json", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"type": "error", "message": f"Invalid stdin JSON: {e}"}))
        sys.exit(1)

    messages = payload.get("messages") or []
    if not isinstance(messages, list):
        messages = []

    def on_event(event: dict) -> None:
        print(json.dumps(sanitize_unicode_deep(event), default=str), flush=True)

    try:
        result = run_help_turn(messages, on_event=on_event)
    except Exception as e:
        msg = str(e).strip() or type(e).__name__
        print(json.dumps({"type": "error", "message": msg}), flush=True)
        sys.exit(1)

    if not result.get("ok"):
        err = result.get("error", "Help agent failed")
        print(json.dumps({"type": "error", "message": err}), flush=True)
        sys.exit(1)
    sys.exit(0)
