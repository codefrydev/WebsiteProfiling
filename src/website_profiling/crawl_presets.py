"""Property crawl presets — keep in sync with web/src/lib/crawlPresets.ts."""
from __future__ import annotations

from typing import Any

CRAWL_PRESET_PATCHES: dict[str, dict[str, str]] = {
    "starter": {
        "max_pages": "500",
        "crawl_render_mode": "static",
        "crawl_stream_to_db": "false",
        "run_lighthouse_on_pages": "true",
        "lighthouse_max_pages": "5",
    },
    "spa": {
        "max_pages": "2000",
        "crawl_render_mode": "auto",
        "crawl_js_concurrency": "3",
        "crawl_stream_to_db": "true",
        "run_lighthouse_on_pages": "true",
        "lighthouse_max_pages": "10",
    },
    "ecommerce": {
        "max_pages": "10000",
        "crawl_render_mode": "auto",
        "crawl_stream_to_db": "true",
        "concurrency": "12",
        "run_lighthouse_on_pages": "false",
        "lighthouse_max_pages": "0",
    },
    "performance": {
        "max_pages": "1000",
        "crawl_render_mode": "static",
        "run_lighthouse": "true",
        "run_lighthouse_on_pages": "true",
        "lighthouse_max_pages": "25",
        "lighthouse_strategy": "mobile",
        "lighthouse_categories": "performance,accessibility,best-practices,seo",
    },
}

DEFAULT_CRAWL_PRESET_ID = "starter"


def apply_crawl_preset(preset_id: str, config: dict[str, Any]) -> dict[str, str]:
    """Merge preset patch into pipeline config (string values only)."""
    key = preset_id if preset_id in CRAWL_PRESET_PATCHES else DEFAULT_CRAWL_PRESET_ID
    patch = CRAWL_PRESET_PATCHES[key]
    merged: dict[str, str] = {str(k): str(v) for k, v in config.items()}
    merged.update(patch)
    return merged
