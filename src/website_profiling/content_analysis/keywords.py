"""Per-page keyword extraction."""
from __future__ import annotations

import json
from collections import Counter

from .constants import STOP_WORDS


def top_keywords_json(words: list[str], *, limit: int = 10) -> str:
    keyword_words = [w.lower() for w in words if len(w) >= 4 and w.lower() not in STOP_WORDS]
    top_keywords = Counter(keyword_words).most_common(limit)
    max_kw = top_keywords[0][1] if top_keywords else 0
    kw_rows = []
    for w, c in top_keywords:
        score = round(100 * c / max_kw) if max_kw else 0
        kw_rows.append({"word": w, "count": c, "score": int(score)})
    return json.dumps(kw_rows)
