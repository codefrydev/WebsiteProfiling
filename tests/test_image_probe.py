"""Tests for image URL probing."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.analysis.image_probe import (
    _PARTIAL_GET_CAP,
    _USER_AGENT,
    _parse_size,
    _probe_one,
    collect_image_refs_from_links,
    probe_image_urls,
)


def test_collect_image_refs_dedupes_and_kinds() -> None:
    links = [
        {
            "url": "https://ex.com/a",
            "og_image": "https://cdn.ex.com/og.png",
            "twitter_image": "https://cdn.ex.com/og.png",
            "page_analysis": {"image_urls": ["https://cdn.ex.com/hero.jpg", "https://cdn.ex.com/hero.jpg"]},
        },
        {
            "url": "https://ex.com/b",
            "page_analysis": {"image_urls": ["https://cdn.ex.com/hero.jpg"]},
        },
    ]
    refs = collect_image_refs_from_links(links)
    assert "https://cdn.ex.com/hero.jpg" in refs
    assert refs["https://cdn.ex.com/hero.jpg"]["kinds"] == {"content"}
    assert set(refs["https://cdn.ex.com/hero.jpg"]["source_pages"]) == {"https://ex.com/a", "https://ex.com/b"}
    assert refs["https://cdn.ex.com/og.png"]["kinds"] == {"og", "twitter"}


def test_collect_image_refs_skips_invalid_links() -> None:
    refs = collect_image_refs_from_links([
        "not-a-dict",
        {"url": "", "page_analysis": {"image_urls": ["https://cdn.ex.com/x.png"]}},
        {"url": "https://ex.com/ok", "og_image": "https://cdn.ex.com/og.png"},
    ])
    assert list(refs) == ["https://cdn.ex.com/og.png"]


def test_parse_size_invalid_content_length() -> None:
    assert _parse_size({"Content-Length": "not-a-number"}) is None
    assert _parse_size({}) is None
    assert _parse_size({"content-length": "42"}) == 42


def test_probe_skips_data_and_non_http() -> None:
    urls = ["data:image/png;base64,abc", "ftp://ex.com/x.png", "https://ex.com/a.png"]
    session = MagicMock()
    session.head.return_value = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/png", "Content-Length": "100"},
    )
    with patch("website_profiling.analysis.image_probe.requests.Session", return_value=session):
        results = probe_image_urls(urls, concurrency=1, timeout=5, session=session)
    assert len(results) == 1
    assert results[0]["url"] == "https://ex.com/a.png"
    assert results[0]["size_bytes"] == 100


def test_probe_dedupes_urls() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/jpeg", "Content-Length": "50"},
    )
    urls = ["https://ex.com/x.jpg", "https://ex.com/x.jpg#frag"]
    results = probe_image_urls(urls, concurrency=1, timeout=5, session=session)
    assert len(results) == 1
    assert session.head.call_count == 1


def test_probe_get_fallback_on_405() -> None:
    session = MagicMock()
    head_resp = MagicMock(status_code=405, headers={})
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/png"},
        iter_content=lambda chunk_size=8192: [b"x" * 100],
    )
    get_resp.close = MagicMock()
    session.head.return_value = head_resp
    session.get.return_value = get_resp
    results = probe_image_urls(["https://ex.com/img.png"], concurrency=1, timeout=5, session=session)
    assert len(results) == 1
    assert results[0]["status"] == 200
    assert results[0]["size_bytes"] == 100
    session.get.assert_called_once()


def test_probe_get_fallback_counts_bytes_when_no_content_length() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=501, headers={})
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/jpeg"},
        iter_content=lambda chunk_size=8192: [b"a" * 10],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/no-cl.jpg", timeout=5, session=session)
    assert result["size_bytes"] == 10


def test_probe_get_fallback_empty_chunk_stops_read() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=501, headers={})
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/jpeg"},
        iter_content=lambda chunk_size=8192: [b"", b"ignored"],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/empty-chunk.jpg", timeout=5, session=session)
    assert result["size_bytes"] is None


def test_probe_get_fallback_hits_partial_cap() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=403, headers={})
    big = b"x" * (_PARTIAL_GET_CAP + 1)
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/png"},
        iter_content=lambda chunk_size=8192: [big],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/big.png", timeout=5, session=session)
    assert result["size_bytes"] == _PARTIAL_GET_CAP + 1


def test_probe_head_200_streams_when_no_content_length() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=200, headers={"Content-Type": "image/webp"})
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/webp"},
        iter_content=lambda chunk_size=8192: [b"webp-bytes"],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/stream.webp", timeout=5, session=session)
    assert result["size_bytes"] == len(b"webp-bytes")
    session.get.assert_called_once()


def test_probe_head_200_partial_get_cap() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=200, headers={})
    huge = b"y" * (_PARTIAL_GET_CAP + 500)
    get_resp = MagicMock(
        status_code=200,
        headers={},
        iter_content=lambda chunk_size=8192: [huge],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/huge.jpg", timeout=5, session=session)
    assert result["size_bytes"] == _PARTIAL_GET_CAP + 500


def test_probe_head_200_empty_stream_chunk() -> None:
    session = MagicMock()
    session.head.return_value = MagicMock(status_code=200, headers={"Content-Type": "image/png"})
    get_resp = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/png"},
        iter_content=lambda chunk_size=8192: [b""],
    )
    get_resp.close = MagicMock()
    session.get.return_value = get_resp
    result = _probe_one("https://ex.com/empty-stream.png", timeout=5, session=session)
    assert result["size_bytes"] is None
    session.get.assert_called_once()


def test_probe_records_error() -> None:
    session = MagicMock()
    session.head.side_effect = TimeoutError("timed out")
    results = probe_image_urls(["https://ex.com/fail.png"], concurrency=1, timeout=1, session=session)
    assert results[0]["error"]
    assert results[0]["size_bytes"] is None


def test_probe_creates_and_closes_own_session() -> None:
    mock_session = MagicMock()
    mock_session.head.return_value = MagicMock(
        status_code=200,
        headers={"Content-Type": "image/png", "Content-Length": "1"},
    )
    with patch("website_profiling.analysis.image_probe.requests.Session", return_value=mock_session) as session_cls:
        results = probe_image_urls(["https://ex.com/a.png"], concurrency=1, timeout=5)
    session_cls.assert_called_once()
    mock_session.headers.update.assert_called_once_with({"User-Agent": _USER_AGENT})
    mock_session.close.assert_called_once()
    assert results[0]["size_bytes"] == 1

