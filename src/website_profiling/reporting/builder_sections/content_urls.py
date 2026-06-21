"""Per-URL content issue lists for the On-Page Content view.

Extracted verbatim from ``reporting/builder.py``. Pure function of the crawl
DataFrame (and the success-status subset computed by the caller).
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from ..seo_summary import (
    META_DESC_LEN_MAX,
    META_DESC_LEN_MIN,
    THIN_CONTENT_CHARS,
    TITLE_LEN_MAX,
    TITLE_LEN_MIN,
)


def _int_or_zero(value: Any) -> int:
    """Coerce *value* to int, treating NaN / None / non-numeric as 0.

    ``int(pd.to_numeric(x, errors="coerce") or 0)`` is unsafe: a NaN result is
    truthy in Python, so ``NaN or 0`` evaluates to ``NaN`` and ``int(NaN)``
    raises ValueError — crashing the whole report build on a single bad cell.
    """
    num = pd.to_numeric(value, errors="coerce")
    return int(num) if pd.notna(num) else 0


def build_content_url_lists(
    df: pd.DataFrame,
    success_df_urls: pd.DataFrame,
) -> dict[str, list[dict[str, Any]]]:
    """Build the ``content_urls`` payload slice (missing_h1, thin_content, etc.)."""
    missing_h1: list[dict[str, Any]] = []
    missing_title: list[dict[str, Any]] = []
    multiple_h1: list[dict[str, Any]] = []
    if "h1_count" in df.columns:
        h1c = pd.to_numeric(df["h1_count"], errors="coerce").fillna(-1).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            t = row.get("title")
            title_str = "" if pd.isna(t) else str(t).strip()
            if h1c.iloc[i] == 0 or h1c.iloc[i] == -1:
                missing_h1.append({"url": u, "title": title_str})
            elif h1c.iloc[i] > 1:
                multiple_h1.append({"url": u, "h1_count": int(h1c.iloc[i]), "title": title_str})
    if "title" in df.columns:
        titles = df["title"].fillna("").astype(str)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            if titles.iloc[i].strip() == "":
                missing_title.append({"url": u})

    missing_meta_desc = []
    meta_desc_short = []
    meta_desc_long = []
    thin_content = []
    if "meta_description_len" in df.columns:
        md_len = pd.to_numeric(df["meta_description_len"], errors="coerce").fillna(0).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            ml = md_len.iloc[i]
            title_str = "" if pd.isna(row.get("title")) else str(row.get("title")).strip()
            if ml == 0:
                missing_meta_desc.append({"url": u, "title": title_str})
            elif 0 < ml < META_DESC_LEN_MIN:
                meta_desc_short.append({"url": u, "title": title_str, "meta_desc_len": int(ml)})
            elif ml > META_DESC_LEN_MAX:
                meta_desc_long.append({"url": u, "title": title_str, "meta_desc_len": int(ml)})
    if "content_length" in df.columns:
        cl = pd.to_numeric(df["content_length"], errors="coerce").fillna(0).astype(int)
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            c = int(cl.iloc[i])
            if 0 < c < THIN_CONTENT_CHARS:
                title_str = "" if pd.isna(row.get("title")) else str(row.get("title")).strip()
                thin_content.append({"url": u, "title": title_str, "content_length": c})

    missing_canonical: list[dict[str, Any]] = []
    canonical_mismatch: list[dict[str, Any]] = []
    missing_alt: list[dict[str, Any]] = []
    if "canonical_url" in success_df_urls.columns:
        for _, row in success_df_urls.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            title_str = "" if pd.isna(row.get("title")) else str(row.get("title")).strip()
            canon = "" if pd.isna(row.get("canonical_url")) else str(row.get("canonical_url")).strip()
            if not canon:
                missing_canonical.append({"url": u, "title": title_str})
            elif u.rstrip("/").lower() != canon.rstrip("/").lower():
                canonical_mismatch.append({"url": u, "canonical_url": canon, "title": title_str})
    if "images_without_alt" in success_df_urls.columns:
        alt_missing = pd.to_numeric(success_df_urls["images_without_alt"], errors="coerce").fillna(0).astype(int)
        for i, row in success_df_urls.iterrows():
            if alt_missing.loc[i] <= 0:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            missing_alt.append({
                "url": str(u).strip(),
                "images_without_alt": int(alt_missing.loc[i]),
                "images_total": _int_or_zero(row.get("images_total")),
            })

    missing_lazy: list[dict[str, Any]] = []
    missing_dimensions: list[dict[str, Any]] = []
    if "img_without_lazy" in success_df_urls.columns:
        lazy_missing = pd.to_numeric(success_df_urls["img_without_lazy"], errors="coerce").fillna(0).astype(int)
        for i, row in success_df_urls.iterrows():
            if lazy_missing.loc[i] <= 0:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            missing_lazy.append({
                "url": str(u).strip(),
                "img_without_lazy": int(lazy_missing.loc[i]),
                "images_total": _int_or_zero(row.get("images_total")),
            })
    if "img_without_dimensions" in success_df_urls.columns:
        dim_missing = pd.to_numeric(success_df_urls["img_without_dimensions"], errors="coerce").fillna(0).astype(int)
        for i, row in success_df_urls.iterrows():
            if dim_missing.loc[i] <= 0:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            missing_dimensions.append({
                "url": str(u).strip(),
                "img_without_dimensions": int(dim_missing.loc[i]),
                "images_total": _int_or_zero(row.get("images_total")),
            })

    title_short: list[dict[str, Any]] = []
    title_long: list[dict[str, Any]] = []
    if "title" in df.columns:
        titles = df["title"].fillna("").astype(str)
        tl = titles.str.len()
        for i, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            u = str(u).strip()
            title_str = titles.iloc[i].strip()
            n = int(tl.iloc[i])
            if n == 0:
                continue
            if n < TITLE_LEN_MIN:
                title_short.append({"url": u, "title": title_str, "title_length": n})
            elif n > TITLE_LEN_MAX:
                title_long.append({"url": u, "title": title_str, "title_length": n})

    slow_response: list[dict[str, Any]] = []
    if "response_time_ms" in df.columns:
        rt = pd.to_numeric(df["response_time_ms"], errors="coerce")
        for i, row in df.iterrows():
            ms = rt.iloc[i]
            if pd.isna(ms) or float(ms) <= 2000:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            slow_response.append({"url": str(u).strip(), "response_time_ms": int(ms)})

    missing_html_lang: list[dict[str, Any]] = []
    invalid_viewport: list[dict[str, Any]] = []
    if "html_lang" in success_df_urls.columns:
        for _, row in success_df_urls.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            lang = str(row.get("html_lang") or "").strip()
            if not lang:
                missing_html_lang.append({"url": str(u).strip()})
    if "viewport_present" in success_df_urls.columns:
        vp = success_df_urls["viewport_present"]
        for _, row in success_df_urls.iterrows():
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            if not bool(row.get("viewport_present")):
                invalid_viewport.append({"url": str(u).strip()})

    high_reading_level: list[dict[str, Any]] = []
    very_thin_content: list[dict[str, Any]] = []
    if "reading_level" in success_df_urls.columns:
        rl = pd.to_numeric(success_df_urls["reading_level"], errors="coerce")
        for i, row in success_df_urls.iterrows():
            val = rl.loc[i]
            if pd.isna(val) or float(val) <= 12:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            high_reading_level.append({"url": str(u).strip(), "reading_level": float(val)})
    if "word_count" in success_df_urls.columns:
        wc = pd.to_numeric(success_df_urls["word_count"], errors="coerce").fillna(0).astype(int)
        for i, row in success_df_urls.iterrows():
            w = int(wc.loc[i])
            if w <= 0 or w >= 100:
                continue
            u = row.get("url")
            if pd.isna(u) or not u:
                continue
            very_thin_content.append({"url": str(u).strip(), "word_count": w})

    return {
        "missing_h1": missing_h1,
        "missing_title": missing_title,
        "multiple_h1": multiple_h1,
        "missing_meta_desc": missing_meta_desc,
        "meta_desc_short": meta_desc_short,
        "meta_desc_long": meta_desc_long,
        "thin_content": thin_content,
        "missing_canonical": missing_canonical,
        "canonical_mismatch": canonical_mismatch,
        "missing_alt": missing_alt,
        "missing_lazy": missing_lazy,
        "missing_dimensions": missing_dimensions,
        "title_short": title_short,
        "title_long": title_long,
        "slow_response": slow_response,
        "missing_html_lang": missing_html_lang,
        "invalid_viewport": invalid_viewport,
        "high_reading_level": high_reading_level,
        "very_thin_content": very_thin_content,
    }
