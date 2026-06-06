"""Install and verify Playwright + Chromium for JavaScript crawls."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from .browser import _BROWSER_INSTALL_MSG

_CHROME_NAMES = ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable")


def _repo_root() -> Path:
    root = (os.environ.get("WEBSITE_PROFILING_ROOT") or "").strip()
    if root:
        return Path(root)
    return Path(__file__).resolve().parents[4]


def _auto_install_enabled() -> bool:
    flag = os.environ.get("WP_SKIP_BROWSER_AUTO_INSTALL", "").strip().lower()
    return flag not in ("1", "true", "yes")


def _playwright_importable() -> bool:
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


def _system_chromium_available() -> bool:
    chrome_path = (os.environ.get("CHROME_PATH") or "").strip()
    if chrome_path and os.path.isfile(chrome_path):
        return True
    return any(shutil.which(name) for name in _CHROME_NAMES)


def _playwright_chromium_available() -> bool:
    if not _playwright_importable():
        return False
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            executable = (playwright.chromium.executable_path or "").strip()
            return bool(executable and os.path.isfile(executable))
    except Exception:
        return False


def chromium_available() -> bool:
    return _system_chromium_available() or _playwright_chromium_available()


def browser_status() -> dict[str, str | bool]:
    """Non-raising check for JS crawl prerequisites."""
    if not _playwright_importable():
        return {"ok": False, "message": _BROWSER_INSTALL_MSG}
    if chromium_available():
        return {"ok": True}
    return {"ok": False, "message": _BROWSER_INSTALL_MSG}


def _pip_install_browser_requirements() -> None:
    req = _repo_root() / "requirements-browser.txt"
    if not req.is_file():
        raise RuntimeError(f"Missing {req.name}; cannot auto-install Playwright.")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)],
        check=True,
        cwd=_repo_root(),
    )


def _playwright_install_chromium() -> None:
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        check=True,
        cwd=_repo_root(),
    )


def ensure_browser_deps(*, install: bool | None = None) -> dict[str, str | bool]:
    """Install Playwright and Chromium when missing, then return browser_status()."""
    status = browser_status()
    if status["ok"]:
        return status

    should_install = _auto_install_enabled() if install is None else install
    if not should_install:
        return status

    try:
        if not _playwright_importable():
            _pip_install_browser_requirements()
        if not chromium_available():
            _playwright_install_chromium()
    except (OSError, subprocess.CalledProcessError) as exc:
        return {
            "ok": False,
            "message": f"{_BROWSER_INSTALL_MSG} Auto-install failed: {exc}",
        }

    return browser_status()
