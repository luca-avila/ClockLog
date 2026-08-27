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

import pytest
from httpx import ASGITransport, AsyncClient, Headers

from app.core.security import create_access_token
from app.main import app
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user


async def _register_and_post(db_session) -> tuple[dict, str]:
    """Create user, auth, return headers + user_id."""
    email = f"label-{uuid.uuid4()}@example.com"
    user = await create_user(db_session, UserCreate(email=email, password="secret12"))
    await db_session.commit()
    token = create_access_token(data={"sub": user.email})
    return {"Authorization": f"Bearer {token}"}, str(user.id)


class TestRecentLabels:
    @pytest.mark.asyncio
    async def test_deduped_most_recent_first(self, db_session):
        headers, _ = await _register_and_post(db_session)

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Post blocks with labels at different times
            base = "2026-08-05T"
            labels_data = [
                ("debug JWT refresh", f"{base}09:00:00+00:00"),
                ("read docs", f"{base}09:05:00+00:00"),
                ("debug JWT refresh", f"{base}09:10:00+00:00"),
                ("write spec", f"{base}09:15:00+00:00"),
            ]
            for label, started in labels_data:
                await client.post(
                    "/blocks",
                    json={
                        "id": str(uuid.uuid4()),
                        "started_at": started,
                        "ended_at": None,
                        "status": "completed",
                        "label": label,
                        "tag_id": None,
                    },
                    headers=Headers(headers),
                )

            resp = await client.get("/blocks/recent-labels", headers=Headers(headers))
        assert resp.status_code == 200
        labels = resp.json()
        # Deduped — "debug JWT refresh" appears once
        assert len(labels) == 3
        # Most recent first ("write spec" was last)
        assert labels[0] == "write spec"
        assert labels[1] == "debug JWT refresh"
        assert labels[2] == "read docs"

    @pytest.mark.asyncio
    async def test_scoped_to_user(self, db_session):
        headers1, _ = await _register_and_post(db_session)
        headers2, _ = await _register_and_post(db_session)

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/blocks",
                json={
                    "id": str(uuid.uuid4()),
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:25:00+00:00",
                    "status": "completed",
                    "label": "user1-label",
                    "tag_id": None,
                },
                headers=Headers(headers1),
            )

            resp = await client.get("/blocks/recent-labels", headers=Headers(headers2))
        assert resp.status_code == 200
        labels = resp.json()
        assert "user1-label" not in labels
