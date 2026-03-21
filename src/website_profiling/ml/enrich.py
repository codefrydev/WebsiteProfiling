"""
Optional ML/NLP enrichment for crawl reports. All features are gated by config flags.

Install extras: pip install -r requirements-ml.txt
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from typing import Any, Optional

import pandas as pd

ML_INSTALL_HINT = "Install optional ML dependencies: pip install -r requirements-ml.txt"


def _cfg_bool(cfg: dict[str, str] | None, key: str, default: bool = False) -> bool:
    if not cfg:
        return default
    return str(cfg.get(key, default)).lower() in ("true", "1", "yes")


def _cfg_int(cfg: dict[str, str] | None, key: str, default: int) -> int:
    if not cfg:
        return default
    raw = cfg.get(key)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _normalize_fingerprint_text(row: pd.Series) -> str:
    parts = []
    for col in ("title", "h1", "meta_description", "heading_sequence"):
        if col not in row.index:
            continue
        v = row.get(col)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if s:
            parts.append(s)
    t = " ".join(parts).lower()
    t = re.sub(r"\s+", " ", t)
    return t[:8000]


def _tokenize_simhash(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]{3,}", text.lower())


def _stable_token_hash(token: str) -> int:
    return int.from_bytes(hashlib.md5(token.encode("utf-8")).digest()[:8], "little")


def simhash_64(text: str) -> int:
    """64-bit SimHash for near-duplicate detection (exact bucket grouping; optional Hamming merge)."""
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
        raise ImportError(f"{ML_INSTALL_HINT}\n({e})") from e


def _import_sklearn():
    try:
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler

        return IsolationForest, StandardScaler
    except ImportError as e:
        raise ImportError(f"{ML_INSTALL_HINT}\n({e})") from e


def _import_langdetect():
    try:
        from langdetect import LangDetectException, detect

        return detect, LangDetectException
    except ImportError as e:
        raise ImportError(f"{ML_INSTALL_HINT}\n({e})") from e


def _import_sentence_transformers():
    # Before importing HF stack: hide safetensors "LOAD REPORT" / weight-key chatter on stderr.
    os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer
    except ImportError as e:
        raise ImportError(f"{ML_INSTALL_HINT}\n({e})") from e


def _import_spacy():
    try:
        import spacy

        return spacy
    except ImportError as e:
        raise ImportError(f"{ML_INSTALL_HINT}\n({e})") from e


def compute_duplicate_groups(
    df: pd.DataFrame,
    cfg: dict[str, str] | None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """
    SimHash exact groups + optional rapidfuzz merge (high token_set_ratio).
    Returns (groups for payload, url -> group_id).
    """
    if df.empty or not _cfg_bool(cfg, "enable_duplicate_detection", False):
        return [], {}

    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if "content_type" in success.columns:
        success = success[success["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    max_pages = _cfg_int(cfg, "ml_dup_max_pages", 2000) or 2000
    success = success.head(max_pages)

    url_to_fp: dict[str, str] = {}
    url_to_sh: dict[str, int] = {}
    for _, row in success.iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        if not u:
            continue
        fp = _normalize_fingerprint_text(row)
        if len(fp) < 20:
            continue
        url_to_fp[u] = fp
        url_to_sh[u] = simhash_64(fp)

    # Exact SimHash buckets
    bucket: dict[int, list[str]] = defaultdict(list)
    for u, h in url_to_sh.items():
        bucket[h].append(u)

    fuzz = _import_rapidfuzz()
    fuzzy_threshold = _cfg_int(cfg, "ml_fuzzy_threshold", 92) or 92
    hamming_max = _cfg_int(cfg, "ml_simhash_hamming", 0) or 0

    # Union-find
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        if x not in parent:
            parent[x] = x
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    urls = list(url_to_fp.keys())
    for u in urls:
        parent.setdefault(u, u)

    # Merge exact simhash
    for h, members in bucket.items():
        if len(members) < 2:
            continue
        base = members[0]
        for m in members[1:]:
            union(base, m)

    # Hamming-close simhash (optional, O(n^2) capped)
    if hamming_max > 0 and len(urls) <= 800:
        sh_list = [(u, url_to_sh[u]) for u in urls]
        for i, (u1, h1) in enumerate(sh_list):
            for u2, h2 in sh_list[i + 1 :]:
                if _hamming(h1, h2) <= hamming_max:
                    union(u1, u2)

    # Fuzzy title fingerprint merge (pairwise cap)
    if len(urls) <= 600:
        for i, u1 in enumerate(urls):
            fp1 = url_to_fp.get(u1, "")
            for u2 in urls[i + 1 :]:
                fp2 = url_to_fp.get(u2, "")
                if not fp1 or not fp2:
                    continue
                if fuzz.token_set_ratio(fp1, fp2) >= fuzzy_threshold:
                    union(u1, u2)

    clusters: dict[str, list[str]] = defaultdict(list)
    for u in urls:
        clusters[find(u)].append(u)

    groups_out: list[dict[str, Any]] = []
    url_to_gid: dict[str, str] = {}
    gid = 0
    max_groups = 200
    for root, members in clusters.items():
        if len(members) < 2:
            continue
        members = sorted(set(members))
        rep = members[0]
        methods = []
        hashes = {url_to_sh.get(m) for m in members}
        if len(hashes) == 1:
            methods.append("simhash")
        if len(members) > 1 and len(hashes) > 1:
            methods.append("fuzzy")
        if not methods:
            methods.append("simhash")
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

    return groups_out[:max_groups], url_to_gid


def compute_anomalies(df: pd.DataFrame, cfg: dict[str, str] | None) -> list[dict[str, Any]]:
    if df.empty or not _cfg_bool(cfg, "enable_anomaly_urls", False):
        return []

    IsolationForest, StandardScaler = _import_sklearn()
    rows: list[dict[str, Any]] = []
    feat_rows: list[list[float]] = []

    def _pa_int(row: pd.Series, key: str) -> int:
        if "page_analysis" not in row.index:
            return 0
        raw = row.get("page_analysis")
        if raw is None or (isinstance(raw, float) and pd.isna(raw)):
            return 0
        try:
            obj = json.loads(str(raw)) if isinstance(raw, str) else raw
            if isinstance(obj, dict):
                return int(obj.get(key) or 0)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return 0

    for _, row in df.iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        if not u:
            continue
        st = str(row.get("status") or "")
        ok = bool(re.match(r"2\d{2}", st))
        wc = float(pd.to_numeric(row.get("word_count"), errors="coerce") or 0)
        cl = float(pd.to_numeric(row.get("content_length"), errors="coerce") or 0)
        rt = float(pd.to_numeric(row.get("response_time_ms"), errors="coerce") or 0)
        ol = float(pd.to_numeric(row.get("outlinks"), errors="coerce") or 0)
        rl = float(pd.to_numeric(row.get("reading_level"), errors="coerce") or 0)
        chratio = float(pd.to_numeric(row.get("content_html_ratio"), errors="coerce") or 0)
        h1c = float(pd.to_numeric(row.get("h1_count"), errors="coerce") or 0)
        mdlen = float(pd.to_numeric(row.get("meta_description_len"), errors="coerce") or 0)
        il = float(_pa_int(row, "internal_link_count"))
        el = float(_pa_int(row, "external_link_count"))
        feat_rows.append([wc, cl, rt, ol, rl, chratio, h1c, mdlen, il, el, 1.0 if ok else 0.0])
        rows.append({"url": u, "status": st})

    if len(feat_rows) < 10:
        return []

    scaler = StandardScaler()
    X = scaler.fit_transform(feat_rows)
    iso = IsolationForest(random_state=42, contamination="auto", n_estimators=128)
    pred = iso.fit_predict(X)
    scores = iso.decision_function(X)

    out: list[dict[str, Any]] = []
    for i, p in enumerate(pred):
        if p != -1:
            continue
        r = rows[i]
        f = feat_rows[i]
        reasons = []
        if f[2] > 3000:
            reasons.append("high_response_time_ms")
        if f[0] < 50 and f[1] > 500:
            reasons.append("low_word_count_high_html")
        if f[3] > 200:
            reasons.append("very_high_outlinks")
        if f[8] == 0 and r["status"].startswith("2"):
            reasons.append("zero_internal_links_in_analysis")
        out.append(
            {
                "url": r["url"],
                "anomaly_score": round(float(scores[i]), 4),
                "reasons": reasons or ["multivariate_outlier"],
            }
        )
    out.sort(key=lambda x: x["anomaly_score"])
    return out[:150]


def compute_language_signals(df: pd.DataFrame, cfg: dict[str, str] | None) -> tuple[dict[str, str], dict[str, Any]]:
    if df.empty or not _cfg_bool(cfg, "enable_language_detection", False):
        return {}, {"counts": {}, "mixed_site": False}

    detect, LangDetectException = _import_langdetect()
    by_url: dict[str, str] = {}
    for _, row in df.iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        if not u:
            continue
        st = str(row.get("status") or "")
        if not re.match(r"2\d{2}", st):
            continue
        text = _normalize_fingerprint_text(row)
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


def compute_spacy_signals(df: pd.DataFrame, cfg: dict[str, str] | None) -> dict[str, dict[str, Any]]:
    if df.empty or not _cfg_bool(cfg, "enable_ner_spacy", False):
        return {}

    spacy = _import_spacy()
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        raise ImportError(
            "spaCy English model missing. Install ML deps (includes en-core-web-sm): "
            "pip install -r requirements-ml.txt — or: python -m spacy download en_core_web_sm"
        ) from None

    max_pages = _cfg_int(cfg, "ml_ner_max_pages", 80) or 80
    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    out: dict[str, dict[str, Any]] = {}
    n = 0
    for _, row in success.iterrows():
        if n >= max_pages:
            break
        u = str(row.get("url") or "").strip().rstrip("/")
        text = _normalize_fingerprint_text(row)
        if len(text) < 40:
            continue
        doc = nlp(text[:50000])
        labels = [e.label_ for e in doc.ents]
        lc = Counter(labels)
        out[u] = {
            "entity_count": len(doc.ents),
            "top_entity_labels": [list(x) for x in lc.most_common(8)],
        }
        n += 1
    return out


def aggregate_ner_site_summary(spacy_by_url: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Roll up spaCy NER label counts across pages for site-level charts."""
    label_totals: Counter[str] = Counter()
    total_entities = 0
    for _u, info in (spacy_by_url or {}).items():
        if not isinstance(info, dict):
            continue
        total_entities += int(info.get("entity_count") or 0)
        for pair in info.get("top_entity_labels") or []:
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                label_totals[str(pair[0])] += int(pair[1])
            elif isinstance(pair, (list, tuple)) and len(pair) == 1:
                label_totals[str(pair[0])] += 1
    return {
        "label_counts": dict(label_totals.most_common(40)),
        "pages_with_ner": len(spacy_by_url or {}),
        "total_entities": total_entities,
    }


def compute_similar_internal(
    df: pd.DataFrame,
    cfg: dict[str, str] | None,
) -> dict[str, list[dict[str, Any]]]:
    if df.empty or not _cfg_bool(cfg, "enable_semantic_similar_internal", False):
        return {}

    ST = _import_sentence_transformers()
    model_name = (cfg or {}).get("ml_sentence_model", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"
    model = ST(model_name)

    max_pages = _cfg_int(cfg, "ml_max_pages_st", 400) or 400
    top_k = min(_cfg_int(cfg, "ml_similar_top_k", 5) or 5, 15)

    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if "content_type" in success.columns:
        success = success[success["content_type"].fillna("").str.contains("text/html", case=False, na=False)]

    urls: list[str] = []
    texts: list[str] = []
    for _, row in success.head(max_pages).iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        t = _normalize_fingerprint_text(row)
        if not u or len(t) < 15:
            continue
        urls.append(u)
        texts.append(t[:2000])

    if len(urls) < 2:
        return {}

    emb = model.encode(texts, show_progress_bar=False, batch_size=32, convert_to_numpy=True)
    # cosine similarity via normalized vectors
    import numpy as np

    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12
    e = emb / norms
    sim = e @ e.T

    result: dict[str, list[dict[str, Any]]] = {}
    n = len(urls)
    for i in range(n):
        scores = [(sim[i, j], j) for j in range(n) if j != i]
        scores.sort(reverse=True)
        result[urls[i]] = [
            {"url": urls[j], "score": round(float(s), 4)} for s, j in scores[:top_k]
        ]
    return result


def merge_ml_into_payload(payload: dict[str, Any], ml_bundle: dict[str, Any]) -> None:
    """Mutate report payload dict in place with ML fields and per-link merge."""
    payload["content_duplicates"] = ml_bundle.get("content_duplicates") or []
    payload["anomalies"] = ml_bundle.get("anomalies") or []
    payload["language_summary"] = ml_bundle.get("language_summary") or {}
    ns = ml_bundle.get("ner_site_summary") or {}
    if ns:
        payload["ner_site_summary"] = ns
    else:
        payload.pop("ner_site_summary", None)
    err = ml_bundle.get("ml_errors") or []
    if err:
        payload["ml_errors"] = err
    else:
        payload.pop("ml_errors", None)

    dup_gid = ml_bundle.get("url_duplicate_group_id") or {}
    sim_map = ml_bundle.get("similar_internal_by_url") or {}
    lang_map = ml_bundle.get("language_by_url") or {}
    spacy_map = ml_bundle.get("spacy_by_url") or {}
    anomalies_list = ml_bundle.get("anomalies") or []
    anomaly_by_url = {str(a.get("url") or "").strip().rstrip("/"): a for a in anomalies_list if a.get("url")}

    for rec in payload.get("links") or []:
        if not isinstance(rec, dict):
            continue
        u = str(rec.get("url") or "").strip()
        uk = u.rstrip("/")
        rec.pop("duplicate_group_id", None)
        rec.pop("similar_internal", None)
        rec.pop("detected_language", None)
        rec.pop("nlp_entities", None)
        rec.pop("ml_anomaly", None)
        if uk in dup_gid:
            rec["duplicate_group_id"] = dup_gid[uk]
        nei = sim_map.get(uk) or sim_map.get(u)
        if nei:
            rec["similar_internal"] = list(nei)
        if uk in lang_map:
            rec["detected_language"] = lang_map[uk]
        if uk in spacy_map:
            rec["nlp_entities"] = spacy_map[uk]
        if uk in anomaly_by_url:
            rec["ml_anomaly"] = anomaly_by_url[uk]
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
            if uk in spacy_map:
                pa.setdefault("signals", {})["nlp_entities"] = spacy_map[uk]


def run_ml_enrichment(df: pd.DataFrame, cfg: dict[str, str] | None) -> dict[str, Any]:
    """
    Run all enabled enrichment steps. Returns a dict with keys for merging into report payload / per-URL maps.
    """
    bundle: dict[str, Any] = {
        "content_duplicates": [],
        "url_duplicate_group_id": {},
        "anomalies": [],
        "language_by_url": {},
        "language_summary": {"counts": {}, "mixed_site": False},
        "spacy_by_url": {},
        "similar_internal_by_url": {},
        "ner_site_summary": {},
    }

    if df.empty:
        return bundle

    try:
        dups, url_gid = compute_duplicate_groups(df, cfg)
        bundle["content_duplicates"] = dups
        bundle["url_duplicate_group_id"] = url_gid
    except ImportError as e:
        bundle["ml_errors"] = bundle.get("ml_errors", []) + [str(e)]

    try:
        bundle["anomalies"] = compute_anomalies(df, cfg)
    except ImportError as e:
        bundle["ml_errors"] = bundle.get("ml_errors", []) + [str(e)]

    try:
        lang_map, lang_summary = compute_language_signals(df, cfg)
        bundle["language_by_url"] = lang_map
        bundle["language_summary"] = lang_summary
    except ImportError as e:
        bundle["ml_errors"] = bundle.get("ml_errors", []) + [str(e)]

    try:
        bundle["spacy_by_url"] = compute_spacy_signals(df, cfg)
    except (ImportError, OSError) as e:
        bundle["ml_errors"] = bundle.get("ml_errors", []) + [str(e)]

    bundle["ner_site_summary"] = aggregate_ner_site_summary(bundle.get("spacy_by_url") or {})

    try:
        bundle["similar_internal_by_url"] = compute_similar_internal(df, cfg)
    except ImportError as e:
        bundle["ml_errors"] = bundle.get("ml_errors", []) + [str(e)]

    return bundle


def cluster_keywords_semantic(
    keywords: list[str],
    cfg: dict[str, str] | None,
) -> list[dict[str, Any]]:
    """Cluster keyword strings by embedding similarity (cosine)."""
    if not keywords or not _cfg_bool(cfg, "enable_semantic_keywords", False):
        return []

    ST = _import_sentence_transformers()
    model_name = (cfg or {}).get("ml_sentence_model", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"
    model = ST(model_name)
    max_kw = _cfg_int(cfg, "ml_semantic_keyword_max", 200) or 200
    kws = keywords[:max_kw]
    if len(kws) < 2:
        return []

    import numpy as np

    emb = model.encode(kws, show_progress_bar=False, batch_size=64, convert_to_numpy=True)
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12
    e = emb / norms
    sim = e @ e.T

    threshold = float(_cfg_int(cfg, "ml_keyword_cluster_sim", 75) or 75) / 100.0
    parent = {i: i for i in range(len(kws))}

    def find(x: int) -> int:
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(kws)):
        for j in range(i + 1, len(kws)):
            if sim[i, j] >= threshold:
                union(i, j)

    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(len(kws)):
        clusters[find(i)].append(i)

    out: list[dict[str, Any]] = []
    for _, idxs in clusters.items():
        if len(idxs) < 2:
            continue
        words = [kws[i] for i in idxs]
        out.append(
            {
                "top_keyword": words[0],
                "keywords": sorted(words),
                "cluster_score": round(float(np.mean([sim[idxs[0], j] for j in idxs[1:]])), 4)
                if len(idxs) > 1
                else 1.0,
            }
        )
    out.sort(key=lambda x: -x["cluster_score"])
    return out
