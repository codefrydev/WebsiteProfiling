"""Section adapter registry.

Each adapter maps a section key to a function that accepts the raw payload
dict + PdfBuildOptions and returns a list of PdfSection objects.  Adapters
that find no relevant data return an empty list.
"""
from __future__ import annotations

from typing import Any, Callable

from ..document import PdfSection
from ..options import PdfBuildOptions

SectionAdapterFn = Callable[[dict[str, Any], PdfBuildOptions], list[PdfSection]]

# Populated by each sub-module at import time
SECTION_ADAPTERS: dict[str, SectionAdapterFn] = {}


def register(key: str) -> Callable[[SectionAdapterFn], SectionAdapterFn]:
    """Decorator: @register("lighthouse") marks a function as a section adapter."""
    def _wrap(fn: SectionAdapterFn) -> SectionAdapterFn:
        SECTION_ADAPTERS[key] = fn
        return fn
    return _wrap


# Import adapters so they self-register
from . import core, findings, appendix  # noqa: E402, F401
