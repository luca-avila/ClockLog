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

import pytest
from httpx import ASGITransport, AsyncClient, Headers

from app.core.security import create_access_token
from app.main import app
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user


async def _auth(db_session):

    user = await create_user(db_session, UserCreate(email="settings@test.com", password="s"))
    await db_session.commit()
    token = create_access_token(data={"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


class TestSettings:
    @pytest.mark.asyncio
    async def test_get_defaults(self, db_session):
        headers = await _auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/settings", headers=Headers(headers))
        assert resp.status_code == 200
        data = resp.json()
        assert data["focusDuration"] == 25
        assert data["shortBreakDuration"] == 5
        assert data["blocksPerCycle"] == 4
        assert data["autoStartBreaks"] is False

    @pytest.mark.asyncio
    async def test_update_and_read_back(self, db_session):
        headers = await _auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.put(
                "/settings",
                json={"focusDuration": 50, "autoStartBreaks": True},
                headers=Headers(headers),
            )
            resp = await client.get("/settings", headers=Headers(headers))
        assert resp.status_code == 200
        data = resp.json()
        assert data["focusDuration"] == 50
        assert data["autoStartBreaks"] is True
        assert data["shortBreakDuration"] == 5
