"""Crawl frontier: URL queue, depth tracking, and link discovery."""

from __future__ import annotations

import threading
from queue import Queue
from typing import Optional
from urllib.parse import urlparse

import requests

from ..common import load_robots
from . import sitemap
from .discovery import seed_sitemap_for_mode


def url_matches_exclude(url: str, exclude_urls: list[str]) -> bool:
    """True if url equals or is under any exclude prefix."""
    if not exclude_urls:
        return False
    u = url
    for prefix in exclude_urls:
        p = prefix.strip().rstrip("/")
        if not p:
            continue
        if u == p or u.startswith(p + "/"):
            return True
    return False


class CrawlFrontier:
    """Manages crawl queue, visited set, depth limits, and robots rules."""

    def __init__(
        self,
        start_url: str,
        *,
        allow_external: bool = False,
        max_depth: Optional[int] = None,
        exclude_urls: Optional[list[str]] = None,
        follow_links: bool = True,
        ignore_robots: bool = False,
        user_agent: str = "",
        crawl_robots_txt_override: str = "",
    ) -> None:
        self.start_url = start_url
        self.start_netloc = urlparse(self.start_url).netloc
        self.allow_external = allow_external
        self.max_depth = max_depth
        self.exclude_urls = list(exclude_urls) if exclude_urls else []
        self.follow_links = follow_links
        self.user_agent = user_agent
        self.queue: Queue = Queue()
        self.depths: dict[str, int] = {}
        self.visited: set[str] = set()
        self._pending: set[str] = set()
        self.lock = threading.Lock()
        self.rp = None
        if not ignore_robots:
            override = (crawl_robots_txt_override or "").strip()
            if override:
                import urllib.robotparser as robotparser

                self.rp = robotparser.RobotFileParser()
                self.rp.parse(override.splitlines())
            else:
                self.rp = load_robots(self.start_url)

    def same_domain(self, url: str) -> bool:
        return urlparse(url).netloc == self.start_netloc

    def allowed_by_robots(self, url: str) -> bool:
        if not self.rp:
            return True
        try:
            return self.rp.can_fetch(self.user_agent, url)
        except Exception:
            return True

    def queue_contains(self, item: str) -> bool:
        with self.lock:
            return item in self._pending

    def note_dequeued(self, url: str) -> None:
        with self.lock:
            self._pending.discard(url)

    def enqueue_seed(self, url: str, depth: int = 0) -> None:
        u = url
        if url_matches_exclude(u, self.exclude_urls):
            return
        if not self.allow_external and not self.same_domain(u):
            return
        with self.lock:
            if u in self.depths or u in self._pending or u in self.visited:
                return
            self.queue.put(u)
            self._pending.add(u)
            self.depths[u] = depth

    def seed_initial_urls(
        self,
        *,
        discovery_mode: str,
        crawl_url_list: list[str],
        timeout: int,
        session: requests.Session,
    ) -> None:
        mode = discovery_mode
        if mode in ("list", "hybrid"):
            for url in crawl_url_list:
                self.enqueue_seed(url, 0)
        if mode in ("spider", "hybrid"):
            self.enqueue_seed(self.start_url, 0)
        if seed_sitemap_for_mode(mode):
            self.seed_sitemap_urls(timeout, session)

    def seed_sitemap_urls(self, timeout: int, session: requests.Session) -> None:
        try:
            seeds = sitemap.discover_sitemap_urls(
                self.start_url,
                timeout=timeout,
                session=session,
            )
        except Exception:
            return
        for url in seeds:
            self.enqueue_seed(url, 0)

    def try_enqueue_link(self, link: str, from_url: str) -> bool:
        """Enqueue a discovered link if frontier rules allow. Returns True if enqueued."""
        if not self.follow_links:
            return False
        if url_matches_exclude(link, self.exclude_urls):
            return False
        if not self.allow_external and not self.same_domain(link):
            return False
        cur_depth = self.depths.get(from_url, 0)
        if self.max_depth is not None and cur_depth >= self.max_depth:
            return False
        with self.lock:
            if (
                link not in self.visited
                and link not in self.depths
                and link not in self._pending
            ):
                self.queue.put(link)
                self._pending.add(link)
                self.depths[link] = cur_depth + 1
                return True
        return False

    def mark_visited(self, url: str) -> bool:
        """Mark URL visited; return False if already visited."""
        with self.lock:
            if url in self.visited:
                return False
            self.visited.add(url)
            return True

    def should_skip_dequeued(self, url: str) -> bool:
        return url_matches_exclude(url, self.exclude_urls)

    def serialize_state(self) -> dict:
        """Return a JSON-serialisable snapshot of the frontier for pause/resume."""
        with self.lock:
            pending = list(self.queue.queue)
            visited = list(self.visited)
            depths = dict(self.depths)
        return {"pending": pending, "visited": visited, "depths": depths}

    def restore_from_state(self, state: dict) -> None:
        """Pre-populate the frontier from a previously serialised state."""
        with self.lock:
            for url in state.get("pending", []):
                self.queue.put(url)
                self._pending.add(url)
            self.visited.update(state.get("visited", []))
            self.depths.update(state.get("depths", {}))
