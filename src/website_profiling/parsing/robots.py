"""robots.txt loading."""
from __future__ import annotations

from urllib.parse import urlparse
import urllib.robotparser as robotparser

def load_robots(start_url: str):
    """Load robots.txt for the given URL; returns RobotFileParser or None on error."""
    parsed = urlparse(start_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp
    except Exception:
        return None
