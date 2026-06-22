"""Tests for FileService HTTP client."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.clients import file_service


def test_fetch_report_pdf_success() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"%PDF-1.4"
    with patch.object(file_service.requests, "get", return_value=mock_resp) as mock_get:
        data = file_service.fetch_report_pdf(42, profile="standard")
    assert data == b"%PDF-1.4"
    mock_get.assert_called_once()
    assert "/v1/reports/42/pdf" in mock_get.call_args[0][0]


def test_fetch_report_pdf_not_found() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = "missing"
    with patch.object(file_service.requests, "get", return_value=mock_resp):
        with pytest.raises(FileNotFoundError):
            file_service.fetch_report_pdf(99)


def test_fetch_report_pdf_upstream_error() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 502
    mock_resp.text = "bad gateway"
    with patch.object(file_service.requests, "get", return_value=mock_resp):
        with pytest.raises(RuntimeError, match="502"):
            file_service.fetch_report_pdf(1)


def test_fetch_report_pdf_requires_report_id() -> None:
    with pytest.raises(ValueError, match="report_id"):
        file_service.fetch_report_pdf(None)


def test_fetch_report_workbook_success() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"PK\x03\x04"
    with patch.object(file_service.requests, "get", return_value=mock_resp) as mock_get:
        data = file_service.fetch_report_workbook(7)
    assert data.startswith(b"PK")
    assert "/v1/reports/7/workbook" in mock_get.call_args[0][0]


def test_fetch_report_pdf_network_error() -> None:
    import requests

    with patch.object(file_service.requests, "get", side_effect=requests.ConnectionError("refused")):
        with pytest.raises(RuntimeError, match="File service unreachable"):
            file_service.fetch_report_pdf(1)


def test_fetch_report_workbook_requires_report_id() -> None:
    with pytest.raises(ValueError, match="report_id"):
        file_service.fetch_report_workbook(None)
