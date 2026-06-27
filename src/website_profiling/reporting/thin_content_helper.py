"""Shared thin-content detection (200 words; char fallback when word_count absent)."""
from __future__ import annotations

from typing import Any

import pandas as pd

THIN_CONTENT_WORDS = 200


def is_thin_row(row: pd.Series) -> bool:
    wc = pd.to_numeric(row.get("word_count"), errors="coerce")
    if pd.notna(wc) and int(wc) > 0:
        return int(wc) < THIN_CONTENT_WORDS
    cl = pd.to_numeric(row.get("content_length"), errors="coerce")
    if pd.isna(cl):
        return False
    chars = int(cl)
    return chars > 0 and chars // 5 < THIN_CONTENT_WORDS


def thin_content_message(row: pd.Series) -> str:
    wc = pd.to_numeric(row.get("word_count"), errors="coerce")
    if pd.notna(wc) and int(wc) > 0:
        return f"Thin content ({int(wc)} words)"
    cl = pd.to_numeric(row.get("content_length"), errors="coerce")
    chars = 0 if pd.isna(cl) else int(cl)
    return f"Thin content (~{chars // 5} words, from {chars} chars)"


def count_thin_rows(df: pd.DataFrame, *, success_only: bool = True) -> int:
    if df.empty:
        return 0
    target = df
    if success_only and "status" in df.columns:
        target = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
    if target.empty:
        return 0
    if "word_count" in target.columns or "content_length" in target.columns:
        return int(sum(is_thin_row(row) for _, row in target.iterrows()))
    return 0
