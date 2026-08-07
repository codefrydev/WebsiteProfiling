"""Detect bot-block/anti-bot-challenge HTTP responses."""

from __future__ import annotations

_BOT_BLOCK_STATUSES = frozenset({401, 403, 429, 503})


def is_bot_block_status(status: object) -> bool:
    """True when a status code commonly indicates an anti-bot block or challenge."""
    return isinstance(status, int) and status in _BOT_BLOCK_STATUSES
