"""DataFrame and edge list I/O."""
from __future__ import annotations

import json
import os

import pandas as pd

"""
Shared helpers for crawler and report/plot scripts.
"""
import json
import os
import warnings
from urllib.parse import urljoin, urldefrag, urlparse
import urllib.robotparser as robotparser
import ast
import math

import pandas as pd
from bs4 import BeautifulSoup


def load_dataframe(path: str) -> pd.DataFrame:
    """Load a DataFrame from CSV or JSON (by extension)."""
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        return pd.read_json(path, orient="records")
    return pd.read_csv(path)


def save_dataframe(df: pd.DataFrame, path: str) -> None:
    """Save a DataFrame to CSV or JSON (by extension). Uses default_handler for JSON to avoid numpy types."""
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        df.to_json(path, orient="records", indent=2, date_format="iso", default_handler=str)
    else:
        df.to_csv(path, index=False)


def load_edges(path: str) -> list[tuple[str, str]]:
    """Load edge list from CSV or JSON (by extension). Returns list of (from_url, to_url)."""
    if not os.path.isfile(path):
        return []
    path_lower = path.lower()
    try:
        if path_lower.endswith(".json"):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return [(str(o.get("from", "")), str(o.get("to", ""))) for o in data if o.get("from") and o.get("to")]
            return []
        edf = pd.read_csv(path)
        if {"from", "to"}.issubset(edf.columns):
            return [(str(a), str(b)) for a, b in edf[["from", "to"]].values]
    except Exception:
        pass
    return []


def save_edges(edges: list[tuple[str, str]], path: str) -> None:
    """Save edge list to CSV or JSON (by extension)."""
    path_lower = path.lower()
    if path_lower.endswith(".json"):
        data = [{"from": a, "to": b} for a, b in edges]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    else:
        pd.DataFrame(edges, columns=["from", "to"]).to_csv(path, index=False)

