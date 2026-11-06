"""Small in-memory sliding-window limiter. Per process: put a gateway limiter in front for a public launch."""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from .config import settings

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def allow(key: str, limit: int, window_seconds: int) -> bool:
    if not settings.rate_limits_enabled:
        return True
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        if len(_hits) > 20000:
            for k in [k for k, v in _hits.items() if not v]:
                del _hits[k]
        return True


def enforce(key: str, limit: int, window_seconds: int, message: str = "Too many requests. Slow down and try again soon.") -> None:
    if not allow(key, limit, window_seconds):
        raise HTTPException(429, message)


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
