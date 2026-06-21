"""Streamable HTTP MCP server for remote Site Audit tool access."""
from __future__ import annotations

import contextlib
import hmac
import json
import os
from collections.abc import AsyncIterator, Callable
from typing import Any
from urllib.parse import urlparse

from .settings import McpHttpSettings, load_mcp_http_settings

_LOCALHOST_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _bool_env(name: str, *, default: bool = False) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _http_host() -> str:
    return _env("WP_MCP_HTTP_HOST", "127.0.0.1") or "127.0.0.1"


def _http_port() -> int:
    raw = _env("WP_MCP_HTTP_PORT", "8000") or "8000"
    try:
        port = int(raw)
    except ValueError as e:
        raise SystemExit(f"Invalid WP_MCP_HTTP_PORT: {raw!r}") from e
    if port < 1 or port > 65535:
        raise SystemExit(f"Invalid WP_MCP_HTTP_PORT: {port}")
    return port


def _http_path() -> str:
    path = _env("WP_MCP_HTTP_PATH", "/mcp") or "/mcp"
    if not path.startswith("/"):
        path = f"/{path}"
    return path.rstrip("/") or "/mcp"


def _is_public_bind(host: str) -> bool:
    return host not in _LOCALHOST_HOSTS


def _host_from_header(host_header: str) -> str:
    host = host_header.strip().lower()
    if not host:
        return ""
    if host.startswith("["):
        end = host.index("]") if "]" in host else -1
        if end > 1:
            return host[1:end]
    return host.split(":")[0]


def _origin_host(origin: str) -> str:
    parsed = urlparse(origin.strip())
    return (parsed.hostname or "").lower()


def _host_allowed(host: str, allowed_hosts: list[str]) -> bool:
    if not allowed_hosts:
        return True
    host_lower = host.lower()
    for entry in allowed_hosts:
        pattern = entry.strip().lower()
        if not pattern:
            continue
        if pattern.startswith("*."):
            suffix = pattern[1:]
            if host_lower == pattern[2:] or host_lower.endswith(suffix):
                return True
            continue
        if host_lower == pattern or host_lower.endswith(f":{pattern}"):
            return True
        if pattern.endswith(":*") and host_lower == pattern[:-2]:
            return True
    return False


def _origin_allowed(origin: str, allowed_origins: list[str]) -> bool:
    if not allowed_origins:
        return True
    if not origin.strip():
        return True
    origin_host = _origin_host(origin)
    for entry in allowed_origins:
        pattern = entry.strip().lower()
        if not pattern:
            continue
        if pattern == origin.strip().lower():
            return True
        if pattern.startswith("http://") or pattern.startswith("https://"):
            continue
        if pattern.startswith("*."):
            # Wildcard: match the apex and any subdomain.
            if origin_host == pattern[2:] or origin_host.endswith(pattern[1:]):
                return True
            continue
        # Bare hostname: exact match only. A non-wildcard pattern must NOT be
        # widened into a ".pattern" suffix match, or `example.com` would also
        # allow `evil.example.com`.
        if origin_host == pattern:
            return True
    return False


def _validate_startup_config() -> None:
    host = _http_host()
    if not _is_public_bind(host):
        return
    settings = load_mcp_http_settings()
    if not settings.token:
        raise SystemExit(
            "Remote MCP token is required when WP_MCP_HTTP_HOST is not localhost "
            f"(current host: {host!r}). Set WP_MCP_TOKEN or save mcp_token on the Secrets page.",
        )
    if not settings.allowed_hosts:
        raise SystemExit(
            "Allowed MCP hosts are required when binding to a non-localhost address "
            f"(current host: {host!r}). Set WP_MCP_ALLOWED_HOSTS or save mcp_allowed_hosts on the Secrets page.",
        )


def _transport_security_settings(host: str):
    from mcp.server.transport_security import TransportSecuritySettings

    public = _is_public_bind(host)
    settings = load_mcp_http_settings()
    if settings.remote_access_configured:
        return TransportSecuritySettings(
            enable_dns_rebinding_protection=False,
            allowed_hosts=[],
            allowed_origins=[],
        )
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=public,
        allowed_hosts=settings.allowed_hosts or [],
        allowed_origins=settings.allowed_origins or [],
    )


async def _reject_request(send: Any, status: int, message: str) -> None:
    body = json.dumps({"error": message}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        },
    )
    await send({"type": "http.response.body", "body": body})


class RemoteAccessMiddleware:
    """Enforce bearer token and allowed Host/Origin using UI-managed settings."""

    def __init__(self, app: Callable[..., Any]) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        settings = load_mcp_http_settings()
        headers = {
            name.decode("latin-1").lower(): value.decode("latin-1")
            for name, value in scope.get("headers", [])
        }
        host = _host_from_header(headers.get("host", ""))

        if settings.allowed_hosts and not _host_allowed(host, settings.allowed_hosts):
            await _reject_request(send, 403, "Host not allowed for remote MCP")
            return

        origin = headers.get("origin", "")
        if settings.allowed_origins:
            if not _origin_allowed(origin, settings.allowed_origins):
                await _reject_request(send, 403, "Origin not allowed for remote MCP")
                return
        elif origin.strip() and not _host_allowed(_origin_host(origin), settings.allowed_hosts):
            # No explicit allowed_origins configured. Transport-level Origin /
            # DNS-rebinding protection is delegated to this middleware (see
            # _transport_security_settings), so a request carrying a browser
            # Origin header must at least be same-host as an allowed host;
            # otherwise an unconfigured deployment performs no Origin check at
            # all. Non-browser clients send no Origin and are unaffected.
            await _reject_request(send, 403, "Origin not allowed for remote MCP")
            return

        if settings.token:
            auth_value = headers.get("authorization", "")
            expected = f"Bearer {settings.token}"
            if not hmac.compare_digest(auth_value.encode("utf-8"), expected.encode("utf-8")):
                await _reject_request(send, 401, "Unauthorized")
                return

        await self.app(scope, receive, send)


def _with_remote_access(app: Callable[..., Any]) -> Callable[..., Any]:
    return RemoteAccessMiddleware(app)


def build_app():
    try:
        from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
        from starlette.applications import Starlette
        from starlette.routing import Mount
        from starlette.types import Receive, Scope, Send
    except ImportError as e:
        raise SystemExit(
            "MCP HTTP dependencies not installed. Run: pip install -r requirements.txt",
        ) from e

    from .server import create_server

    host = _http_host()
    path = _http_path()
    settings = load_mcp_http_settings()
    server = create_server(domain=settings.domain)
    security = _transport_security_settings(host)

    manager = StreamableHTTPSessionManager(
        app=server,
        event_store=None,
        json_response=_bool_env("WP_MCP_JSON_RESPONSE", default=False),
        stateless=True,
        security_settings=security,
    )

    async def handle(scope: Scope, receive: Receive, send: Send) -> None:
        await manager.handle_request(scope, receive, send)

    @contextlib.asynccontextmanager
    async def lifespan(_: Starlette) -> AsyncIterator[None]:
        async with manager.run():
            yield

    starlette_app = Starlette(routes=[Mount(path, app=handle)], lifespan=lifespan)
    return _with_remote_access(starlette_app)


def main() -> None:
    _validate_startup_config()
    try:
        import uvicorn
    except ImportError as e:
        raise SystemExit(
            "uvicorn not installed. Run: pip install -r requirements.txt",
        ) from e

    uvicorn.run(
        build_app(),
        host=_http_host(),
        port=_http_port(),
        log_level=_env("WP_MCP_LOG_LEVEL", "info").lower() or "info",
    )
