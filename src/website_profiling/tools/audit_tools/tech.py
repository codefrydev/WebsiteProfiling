"""Technology stack tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .context import AuditToolContext
from ._slice import payload_dict_slice


def get_tech_stack_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "tech_stack_summary")
