"""Local deterministic content analysis (no LLM)."""
from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from typing import Any

import pandas as pd

from .text import normalize_fingerprint_text

LOCAL_INSTALL_HINT = "Install analysis dependencies: pip install rapidfuzz langdetect"


def _cfg_bool(cfg: dict[str, str] | None, key: str, default: bool = False) -> bool:
    if not cfg:
        return default
    return str(cfg.get(key, default)).lower() in ("true", "1", "yes")


def _cfg_int(cfg: dict[str, str] | None, key: str, default: int) -> int:
    if not cfg:
        return default
    raw = cfg.get(key)
    if raw is None or str(raw).strip() == "":
        # Legacy ml_* keys from old shadow files
        legacy = {
            "analysis_fuzzy_threshold": "ml_fuzzy_threshold",
            "analysis_simhash_hamming": "ml_simhash_hamming",
            "analysis_dup_max_pages": "ml_dup_max_pages",
        }.get(key)
        if legacy and cfg:
            raw = cfg.get(legacy)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _tokenize_simhash(text: str) -> list[str]:
    # `[^\W_]` is word chars minus underscore: identical to the old `[a-z0-9]`
    # for ASCII (input is lowercased) but ALSO matches Unicode letters/digits, so
    # CJK / Cyrillic / Arabic / Greek pages no longer tokenize to nothing and
    # collapse to SimHash 0 (which falsely clustered them all as duplicates).
    return re.findall(r"[^\W_]{3,}", text.lower(), re.UNICODE)


def _stable_token_hash(token: str) -> int:
    return int.from_bytes(hashlib.md5(token.encode("utf-8")).digest()[:8], "little")


def simhash_64(text: str) -> int:
    tokens = _tokenize_simhash(text)
    if not tokens:
        return 0
    vec = [0] * 64
    for tok in tokens:
        h = _stable_token_hash(tok)
        for i in range(64):
            if (h >> i) & 1:
                vec[i] += 1
            else:
                vec[i] -= 1
    out = 0
    for i in range(64):
        if vec[i] > 0:
            out |= 1 << i
    return out


def _hamming(a: int, b: int) -> int:
    x = a ^ b
    c = 0
    while x:
        c += x & 1
        x >>= 1
    return c


def _import_rapidfuzz():
    try:
        from rapidfuzz import fuzz

        return fuzz
    except ImportError as e:
        raise ImportError(f"{LOCAL_INSTALL_HINT}\n({e})") from e


def _import_langdetect():
    try:
        from langdetect import LangDetectException, detect

        return detect, LangDetectException
    except ImportError as e:
        raise ImportError(f"{LOCAL_INSTALL_HINT}\n({e})") from e


def compute_duplicate_groups(
    df: pd.DataFrame,
    cfg: dict[str, str] | None,
) -> tuple[list[dict[str, Any]], dict[str, str], list[str]]:
    if df.empty or not _cfg_bool(cfg, "enable_duplicate_detection", False):
        return [], {}, []

    warnings: list[str] = []

    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if "content_type" in success.columns:
        success = success[success["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    max_pages = _cfg_int(cfg, "analysis_dup_max_pages", 2000) or 2000
    success = success.head(max_pages)

    url_to_fp: dict[str, str] = {}
    url_to_sh: dict[str, int] = {}
    for _, row in success.iterrows():
        u = str(row.get("url") or "").strip()
        if not u:
            continue
        fp = normalize_fingerprint_text(row)
        if len(fp) < 20:
            continue
        url_to_fp[u] = fp
        url_to_sh[u] = simhash_64(fp)

    bucket: dict[int, list[str]] = defaultdict(list)
    for u, h in url_to_sh.items():
        # SimHash 0 means "no tokenizable content", not "identical content".
        # Bucketing those together unioned every untokenizable page as a single
        # giant duplicate group — skip them.
        if h == 0:
            continue
        bucket[h].append(u)

    fuzz = _import_rapidfuzz()
    fuzzy_threshold = _cfg_int(cfg, "analysis_fuzzy_threshold", 92) or 92
    hamming_max = _cfg_int(cfg, "analysis_simhash_hamming", 0) or 0
    simhash_max_urls = _cfg_int(cfg, "analysis_simhash_max_urls", 800) or 800
    fuzzy_max_urls = _cfg_int(cfg, "analysis_fuzzy_max_urls", 600) or 600

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    # Track which detector(s) actually merged each node, tagged on both endpoints
    # so the label survives union-find re-rooting. Inferring the method from the
    # cluster's SimHash-set size is wrong (Hamming-merged clusters have differing
    # hashes; fuzzy-merged clusters can coincidentally share one).
    node_methods: dict[str, set[str]] = defaultdict(set)

    def union(a: str, b: str, method: str) -> None:
        node_methods[a].add(method)
        node_methods[b].add(method)
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    urls = list(url_to_fp.keys())
    for u in urls:
        parent.setdefault(u, u)

    for _h, members in bucket.items():
        if len(members) < 2:
            continue
        base = members[0]
        for m in members[1:]:
            union(base, m, "simhash")

    if hamming_max > 0 and len(urls) <= simhash_max_urls:
        # Exclude SimHash-0 (untokenizable) pages — every pair of them has
        # Hamming distance 0 and would be wrongly merged as duplicates.
        sh_list = [(u, url_to_sh[u]) for u in urls if url_to_sh[u] != 0]
        for i, (u1, h1) in enumerate(sh_list):
            for u2, h2 in sh_list[i + 1 :]:
                if _hamming(h1, h2) <= hamming_max:
                    union(u1, u2, "simhash")
    elif hamming_max > 0 and len(urls) > simhash_max_urls:
        warnings.append(
            f"Duplicate detection: SimHash similarity skipped for {len(urls)} URLs "
            f"(cap {simhash_max_urls}); results may be incomplete."
        )

    if len(urls) <= fuzzy_max_urls:
        for i, u1 in enumerate(urls):
            fp1 = url_to_fp.get(u1, "")
            for u2 in urls[i + 1 :]:
                fp2 = url_to_fp.get(u2, "")
                if fp1 and fp2 and fuzz.token_set_ratio(fp1, fp2) >= fuzzy_threshold:
                    union(u1, u2, "fuzzy")
    elif len(urls) > fuzzy_max_urls:
        warnings.append(
            f"Duplicate detection: fuzzy title matching skipped for {len(urls)} URLs "
            f"(cap {fuzzy_max_urls}); results may be incomplete."
        )

    clusters: dict[str, list[str]] = defaultdict(list)
    for u in urls:
        clusters[find(u)].append(u)

    groups_out: list[dict[str, Any]] = []
    url_to_gid: dict[str, str] = {}
    gid = 0
    max_groups = 200
    for _root, members in clusters.items():
        if len(members) < 2:
            continue
        members = sorted(set(members))
        rep = members[0]
        found_methods: set[str] = set()
        for m in members:
            found_methods |= node_methods.get(m, set())
        methods = sorted(found_methods) or ["simhash"]
        gkey = f"dup_{gid}"
        gid += 1
        groups_out.append(
            {
                "id": gkey,
                "representative_url": rep,
                "member_urls": members[:100],
                "member_count": len(members),
                "methods": methods,
            }
        )
        for m in members:
            url_to_gid[m] = gkey
        if gid >= max_groups:
            break

    return groups_out[:max_groups], url_to_gid, warnings


def compute_language_signals(df: pd.DataFrame, cfg: dict[str, str] | None) -> tuple[dict[str, str], dict[str, Any]]:
    if df.empty or not _cfg_bool(cfg, "enable_language_detection", False):
        return {}, {"counts": {}, "mixed_site": False}

    detect, LangDetectException = _import_langdetect()
    by_url: dict[str, str] = {}
    for _, row in df.iterrows():
        u = str(row.get("url") or "").strip()
        if not u:
            continue
        st = str(row.get("status") or "")
        if not re.match(r"2\d{2}", st):
            continue
        text = normalize_fingerprint_text(row)
        if len(text) < 30:
            continue
        try:
            lang = detect(text[:2000])
            by_url[u] = lang
        except LangDetectException:
            continue

    counts = dict(Counter(by_url.values()).most_common(20))
    mixed = len(counts) > 1
    summary = {"counts": counts, "mixed_site": mixed, "detected_pages": len(by_url)}
    return by_url, summary


def run_local_enrichment(df: pd.DataFrame, cfg: dict[str, str] | None) -> dict[str, Any]:
    bundle: dict[str, Any] = {
        "content_duplicates": [],
        "url_duplicate_group_id": {},
        "language_by_url": {},
        "language_summary": {"counts": {}, "mixed_site": False},
        "spacy_by_url": {},
        "similar_internal_by_url": {},
        "ner_site_summary": {},
        "keyphrases_by_url": {},
        "ml_errors": [],
    }
    if df.empty:
        return bundle

    try:
        dups, url_gid, dup_warnings = compute_duplicate_groups(df, cfg)
        bundle["content_duplicates"] = dups
        bundle["url_duplicate_group_id"] = url_gid
        bundle["ml_errors"].extend(dup_warnings)
    except ImportError as e:
        bundle["ml_errors"].append(str(e))

    try:
        lang_map, lang_summary = compute_language_signals(df, cfg)
        bundle["language_by_url"] = lang_map
        bundle["language_summary"] = lang_summary
    except ImportError as e:
        bundle["ml_errors"].append(str(e))

    return bundle


def merge_bundles(local: dict[str, Any], llm: dict[str, Any]) -> dict[str, Any]:
    out = dict(local or {})
    llm = llm or {}
    for key in (
        "content_duplicates",
        "url_duplicate_group_id",
        "language_by_url",
        "language_summary",
        "spacy_by_url",
        "similar_internal_by_url",
        "ner_site_summary",
        "keyphrases_by_url",
    ):
        if key in llm and llm[key]:
            if key in ("language_by_url", "spacy_by_url", "similar_internal_by_url", "keyphrases_by_url"):
                merged = dict(out.get(key) or {})
                merged.update(llm[key])
                out[key] = merged
            elif key == "url_duplicate_group_id":
                merged = dict(out.get(key) or {})
                merged.update(llm[key])
                out[key] = merged
            else:
                out[key] = llm[key]
    errs = list(out.get("ml_errors") or []) + list(llm.get("ml_errors") or [])
    if errs:
        out["ml_errors"] = errs
    return out


def merge_analysis_into_payload(payload: dict[str, Any], bundle: dict[str, Any]) -> None:
    """Mutate report payload with analysis / LLM enrichment fields."""
    payload["content_duplicates"] = bundle.get("content_duplicates") or []
    payload.pop("anomalies", None)
    payload["language_summary"] = bundle.get("language_summary") or {}
    ns = bundle.get("ner_site_summary") or {}
    if ns:
        payload["ner_site_summary"] = ns
    else:
        payload.pop("ner_site_summary", None)
    err = bundle.get("ml_errors") or []
    if err:
        payload["ml_errors"] = err
    else:
        payload.pop("ml_errors", None)

    dup_gid = bundle.get("url_duplicate_group_id") or {}
    sim_map = bundle.get("similar_internal_by_url") or {}
    lang_map = bundle.get("language_by_url") or {}
    nlp_map = bundle.get("spacy_by_url") or {}
    kp_map = bundle.get("keyphrases_by_url") or {}

    for rec in payload.get("links") or []:
        if not isinstance(rec, dict):
            continue
        u = str(rec.get("url") or "").strip()
        uk = u
        rec.pop("duplicate_group_id", None)
        rec.pop("similar_internal", None)
        rec.pop("detected_language", None)
        rec.pop("nlp_entities", None)
        rec.pop("ml_anomaly", None)
        rec.pop("keyphrases", None)
        if uk in dup_gid:
            rec["duplicate_group_id"] = dup_gid[uk]
        nei = sim_map.get(uk) or sim_map.get(u)
        if nei:
            rec["similar_internal"] = list(nei)
        if uk in lang_map:
            rec["detected_language"] = lang_map[uk]
        if uk in nlp_map:
            rec["nlp_entities"] = nlp_map[uk]
        if uk in kp_map:
            rec["keyphrases"] = kp_map[uk]
        pa = rec.get("page_analysis")
        if isinstance(pa, dict):
            sig = pa.get("signals")
            if isinstance(sig, dict):
                sig.pop("language", None)
                sig.pop("nlp_entities", None)
                if not sig:
                    pa.pop("signals", None)
            if uk in lang_map:
                pa.setdefault("signals", {})["language"] = lang_map[uk]
            if uk in nlp_map:
                pa.setdefault("signals", {})["nlp_entities"] = nlp_map[uk]
