"""HTTP client for FileService (.NET) — PDF and workbook exports."""
from __future__ import annotations

import os
from typing import Optional
from urllib.parse import urlencode

import requests

_DEFAULT_BASE = "http://127.0.0.1:8097"
_TIMEOUT_SECONDS = 120


def _base_url() -> str:
    return (os.environ.get("FILE_SERVICE_URL") or _DEFAULT_BASE).strip().rstrip("/")


def _get_bytes(path: str, *, params: Optional[dict[str, str]] = None) -> bytes:
    url = f"{_base_url()}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    try:
        response = requests.get(url, timeout=_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise RuntimeError(f"File service unreachable at {_base_url()}: {exc}") from exc
    if response.status_code == 404:
        raise FileNotFoundError(response.text or "Report not found")
    if response.status_code >= 400:
        raise RuntimeError(
            f"File service returned {response.status_code}: {response.text[:500]}"
        )
    return response.content


def fetch_report_pdf(
    report_id: Optional[int] = None,
    *,
    profile: str = "standard",
    branding: bool = True,
) -> bytes:
    """Fetch audit PDF bytes from FileService."""
    params = {
        "profile": profile,
        "disposition": "attachment",
        "branding": "true" if branding else "false",
    }
    if report_id is not None:
        return _get_bytes(f"/v1/reports/{int(report_id)}/pdf", params=params)
    raise ValueError("report_id is required for PDF export")


def fetch_report_workbook(report_id: Optional[int] = None) -> bytes:
    """Fetch crawl workbook (.xlsx) bytes from FileService."""
    if report_id is None:
        raise ValueError("report_id is required for workbook export")
    return _get_bytes(
        f"/v1/reports/{int(report_id)}/workbook",
        params={"disposition": "attachment"},
    )
