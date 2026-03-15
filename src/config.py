"""
Parse input.txt-style config file (key = value or key: value, # comments, blank lines).
"""
import os


def load_config(path: str) -> dict[str, str]:
    """Read config file; return dict of key -> value (stripped). Keys and values are lowercased for consistency only for booleans we keep original."""
    result = {}
    if not os.path.isfile(path):
        return result
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, _, v = line.partition("=")
            elif ":" in line:
                k, _, v = line.partition(":")
            else:
                continue
            key = k.strip()
            value = v.strip()
            if key:
                result[key] = value
    return result


def get_bool(cfg: dict, key: str, default: bool = False) -> bool:
    return str(cfg.get(key, default)).lower() in ("true", "1", "yes")


def get_int(cfg: dict, key: str, default: int | None = None) -> int | None:
    raw = cfg.get(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def get_float(cfg: dict, key: str, default: float = 0.0) -> float:
    raw = cfg.get(key)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default
