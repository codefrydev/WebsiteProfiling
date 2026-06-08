"""Inject axe-core in Playwright pages when enable_axe is set."""
from __future__ import annotations

from typing import Any


_AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"


async def run_axe_on_page(page: Any) -> list[dict[str, Any]]:
    """Run axe-core against the current page; return violation summaries."""
    try:
        await page.add_script_tag(url=_AXE_CDN)
        raw = await page.evaluate(
            """async () => {
              if (typeof axe === 'undefined') return [];
              const results = await axe.run(document, { resultTypes: ['violations'] });
              return (results.violations || []).slice(0, 20).map(v => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                help: v.help,
                nodes: (v.nodes || []).length
              }));
            }"""
        )
        return raw if isinstance(raw, list) else []
    except Exception:
        return []
