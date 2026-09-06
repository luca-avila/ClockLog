# ClockLog — a Pomodoro timer and weekly planner
# Copyright (C) 2024  Luca
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Hand-rolled sliding-window rate limiter.

In-memory by design: one VPS, one backend process. A shared store (Redis)
would be a new dependency for no benefit at this scale.
"""

import time
from collections import deque

from fastapi import HTTPException, Request

from app.core.config import settings

_hits: dict[str, deque[float]] = {}


def _now() -> float:
    # Plain module function: tests monkeypatch this to advance the clock
    # instead of production code carrying test machinery.
    return time.monotonic()


def _check(key: str, limit: int, window: float) -> bool:
    """Record a hit and report whether it is within the limit."""
    now = _now()
    bucket = _hits.get(key)
    if bucket is not None:
        while bucket and now - bucket[0] >= window:
            bucket.popleft()
        if not bucket:
            # Evict emptied buckets: an entry per (path, IP) forever is an
            # unbounded dict on a long-lived process.
            del _hits[key]
            bucket = None
    if bucket is None:
        bucket = _hits[key] = deque()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    return True


def _retry_after(key: str, window: float) -> int:
    """Seconds until the oldest hit leaves the window (for Retry-After)."""
    bucket = _hits.get(key)
    if not bucket:
        return 0
    remaining = window - (_now() - bucket[0])
    return max(1, int(remaining + 0.999))


def _enforce(key: str, limit: int, window: float, message: str) -> None:
    # Single check+raise path: callers pass window once, so the check and
    # the Retry-After computation cannot drift onto different windows.
    if _check(key, limit, window):
        return
    raise HTTPException(
        status_code=429,
        detail={"code": "RATE_LIMITED", "message": message},
        headers={"Retry-After": str(_retry_after(key, window))},
    )


async def ip_guard(request: Request) -> None:
    """Per-IP sliding window, keyed by path: register attempts must not
    lock out login."""
    key = f"{request.url.path}:{client_ip(request)}"
    limit, window = settings.login_rate_limit, settings.login_rate_window_seconds
    _enforce(key, limit, window, "Too many attempts, slow down")


async def email_guard(request: Request, key: str) -> None:
    """Per-address window under separate keys from the per-IP one: one
    mailbox must not exhaust another's budget, nor its own IP's. Called
    inside the handler — the body is not available to a Depends without
    parsing it twice.

    `key` is opaque: the limiter is infrastructure and does not
    canonicalize — callers must pass the same spelling storage would use.
    The user schemas normalize email at the boundary, so a validated body
    already carries it.
    """
    full_key = f"{request.url.path}:email:{key}"
    limit, window = settings.auth_email_rate_limit, settings.auth_email_rate_window_seconds
    _enforce(full_key, limit, window, "Too many emails requested, slow down")


def reset() -> None:
    _hits.clear()


def client_ip(request) -> str:
    """Behind nginx the socket IP is always the proxy; trust X-Forwarded-For.

    nginx ($proxy_add_x_forwarded_for) APPENDS the socket peer to whatever
    the client sent, so only the last entry is proxy-vouched — the first
    ones are attacker-controlled and rotating them must not buy a fresh
    rate-limit bucket.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"
