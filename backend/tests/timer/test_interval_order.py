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

import uuid
from datetime import UTC, datetime

from httpx import Headers
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.user.models import User
from app.timer.models import Block, BlockInterval


async def test_response_orders_intervals_chronologically(
    client, verified_user, db_session: AsyncSession
):
    """The API contract, not SQL's incidental row order, fixes first/last."""
    headers, email = await verified_user()
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    started_at = datetime(2026, 8, 5, 9, 0, tzinfo=UTC)
    middle_end = datetime(2026, 8, 5, 9, 12, tzinfo=UTC)
    resumed_start = datetime(2026, 8, 5, 9, 22, tzinfo=UTC)
    ended_at = datetime(2026, 8, 5, 9, 30, tzinfo=UTC)
    block = Block(
        id=uuid.uuid4(),
        user_id=user.id,
        status="completed",
        started_at=started_at,
        intervals=[
            BlockInterval(
                id=uuid.uuid4(),
                started_at=resumed_start,
                ended_at=ended_at,
            ),
            BlockInterval(
                id=uuid.uuid4(),
                started_at=started_at,
                ended_at=middle_end,
            ),
        ],
    )
    db_session.add(block)
    await db_session.commit()

    resp = await client.get(
        "/blocks",
        params={"from": started_at, "to": ended_at},
        headers=Headers(headers),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [iv["started_at"] for iv in body[0]["intervals"]] == [
        "2026-08-05T09:00:00Z",
        "2026-08-05T09:22:00Z",
    ]
