# Tempo — a Pomodoro timer and weekly planner
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

from app.core.config import settings

_hits: dict[str, deque[float]] = {}
_clock_offset = 0.0


def _now() -> float:
    return time.monotonic() + _clock_offset


def check(key: str, limit: int | None = None, window: float | None = None) -> bool:
    """Record a hit and report whether it is within the limit."""
    limit = settings.login_rate_limit if limit is None else limit
    window = settings.login_rate_window_seconds if window is None else window

    bucket = _hits.setdefault(key, deque())
    now = _now()
    while bucket and now - bucket[0] >= window:
        bucket.popleft()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    return True


def retry_after(key: str, window: float | None = None) -> int:
    """Seconds until the oldest hit leaves the window (for Retry-After)."""
    window = settings.login_rate_window_seconds if window is None else window
    bucket = _hits.get(key)
    if not bucket:
        return 0
    remaining = window - (_now() - bucket[0])
    return max(1, int(remaining + 0.999))


def reset() -> None:
    _hits.clear()
    global _clock_offset
    _clock_offset = 0.0


def advance_all(seconds: float) -> None:
    """Test helper: fast-forward every bucket's clock."""
    global _clock_offset
    _clock_offset += seconds


def client_ip(request) -> str:
    """Behind nginx the socket IP is always the proxy; trust X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
