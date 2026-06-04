"""Local content analysis (duplicates, language)."""
from .local import (
    merge_analysis_into_payload,
    merge_bundles,
    run_local_enrichment,
)
from .text import normalize_fingerprint_text

__all__ = [
    "merge_analysis_into_payload",
    "merge_bundles",
    "normalize_fingerprint_text",
    "run_local_enrichment",
]
