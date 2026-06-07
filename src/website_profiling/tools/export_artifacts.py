"""Temporary export artifact store (DATA_DIR/exports) with TTL."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

_ARTIFACT_ID_RE = re.compile(r"^[a-f0-9-]{36}$")
_SPEC_ID_RE = re.compile(r"^[a-f0-9-]{36}$")
_TTL_SECONDS = 24 * 60 * 60
_INLINE_MAX_BYTES = 512 * 1024
_LIST_ROW_KEYS = (
    "pages",
    "items",
    "paths",
    "issues",
    "issue_deltas",
    "rows",
    "keywords",
    "queries",
    "links",
    "findings",
    "technologies",
    "clusters",
    "deltas",
    "results",
)


def _data_dir() -> str:
    return (os.environ.get("DATA_DIR") or os.getcwd()).strip() or os.getcwd()


def exports_dir() -> str:
    path = os.path.join(_data_dir(), "exports")
    os.makedirs(path, exist_ok=True)
    return path


def specs_dir() -> str:
    path = os.path.join(exports_dir(), "specs")
    os.makedirs(path, exist_ok=True)
    return path


def _meta_path(artifact_id: str) -> str:
    return os.path.join(exports_dir(), f"{artifact_id}.meta.json")


def _data_path(artifact_id: str) -> str:
    return os.path.join(exports_dir(), f"{artifact_id}.bin")


def sweep_expired_artifacts() -> int:
    """Remove artifacts older than TTL. Returns count removed."""
    root = exports_dir()
    now = time.time()
    removed = 0
    for name in os.listdir(root):
        if not name.endswith(".meta.json"):
            continue
        meta_path = os.path.join(root, name)
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            created = float(meta.get("created_at_epoch") or 0)
            if created and now - created > _TTL_SECONDS:
                aid = meta.get("artifact_id") or name.replace(".meta.json", "")
                delete_artifact(str(aid))
                removed += 1
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            continue
    return removed


def save_artifact(
    data: bytes | str,
    *,
    filename: str,
    mime_type: str,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sweep_expired_artifacts()
    artifact_id = str(uuid.uuid4())
    if isinstance(data, str):
        raw = data.encode("utf-8")
    else:
        raw = data
    created = datetime.now(timezone.utc)
    record: dict[str, Any] = {
        "artifact_id": artifact_id,
        "filename": filename,
        "mime_type": mime_type,
        "size_bytes": len(raw),
        "created_at": created.isoformat(),
        "created_at_epoch": created.timestamp(),
    }
    if meta:
        record["extra"] = meta
    with open(_meta_path(artifact_id), "w", encoding="utf-8") as f:
        json.dump(record, f)
    with open(_data_path(artifact_id), "wb") as f:
        f.write(raw)
    envelope = artifact_envelope(artifact_id, record)
    if len(raw) <= _INLINE_MAX_BYTES and mime_type.startswith(("text/", "application/json")):
        envelope["content"] = raw.decode("utf-8", errors="replace")
    return envelope


def artifact_envelope(artifact_id: str, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "artifact_id": artifact_id,
        "filename": record.get("filename"),
        "mime_type": record.get("mime_type"),
        "size_bytes": record.get("size_bytes"),
        "download_path": f"/api/chat/artifacts/{artifact_id}",
    }


def read_artifact_meta(artifact_id: str) -> dict[str, Any] | None:
    if not _ARTIFACT_ID_RE.match(artifact_id):
        return None
    path = _meta_path(artifact_id)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_artifact_bytes(artifact_id: str) -> tuple[dict[str, Any], bytes] | None:
    meta = read_artifact_meta(artifact_id)
    if not meta:
        return None
    data_path = _data_path(artifact_id)
    if not os.path.isfile(data_path):
        return None
    with open(data_path, "rb") as f:
        return meta, f.read()


def delete_artifact(artifact_id: str) -> None:
    for path in (_meta_path(artifact_id), _data_path(artifact_id)):
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass


def save_report_spec(spec: dict[str, Any]) -> str:
    spec_id = str(uuid.uuid4())
    spec["report_spec_id"] = spec_id
    spec["created_at"] = datetime.now(timezone.utc).isoformat()
    path = os.path.join(specs_dir(), f"{spec_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(spec, f)
    return spec_id


def read_report_spec(spec_id: str) -> dict[str, Any] | None:
    if not _SPEC_ID_RE.match(spec_id):
        return None
    path = os.path.join(specs_dir(), f"{spec_id}.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else None


def rows_from_tool_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    if result.get("error"):
        return []
    for key in _LIST_ROW_KEYS:
        raw = result.get(key)
        if isinstance(raw, list) and raw:
            rows: list[dict[str, Any]] = []
            for item in raw:
                if isinstance(item, dict):
                    rows.append(item)
                elif item is not None:
                    rows.append({"value": item})
            if rows:
                return rows
    return []


def dicts_to_csv(rows: list[dict[str, Any]], columns: list[str] | None = None) -> str:
    if not rows:
        return ""
    if columns:
        fieldnames = [c for c in columns if c]
    else:
        keys: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for k in row:
                if k not in seen:
                    seen.add(k)
                    keys.append(k)
        fieldnames = keys
    if not fieldnames:
        return ""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    w.writeheader()
    for row in rows:
        w.writerow({k: row.get(k, "") for k in fieldnames})
    return buf.getvalue()
