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

from app.main import app
from app.shared.tag.schemas import TagCreate, TagUpdate
from app.shared.tag.service import (
    create_tag,
    delete_tag,
    get_tag_by_name,
    get_tags_for_user,
    update_tag,
)
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user


class TestTagService:
    @pytest.mark.asyncio
    async def test_create_tag(self, db_session):
        user = await create_user(
            db_session, UserCreate(email="svc@example.com", password="secret12")
        )
        await db_session.commit()

        tag = await create_tag(db_session, TagCreate(name="Study", color="#FF0000"), user.id)
        await db_session.commit()

        assert tag.id is not None
        assert tag.name == "Study"
        assert tag.color == "#FF0000"

    @pytest.mark.asyncio
    async def test_rename_tag(self, db_session):
        user = await create_user(
            db_session, UserCreate(email="svc2@example.com", password="secret12")
        )
        await db_session.commit()
        tag = await create_tag(db_session, TagCreate(name="Old", color="#000000"), user.id)
        await db_session.commit()

        updated = await update_tag(db_session, tag.id, TagUpdate(name="New"), user.id)
        assert updated.name == "New"

    @pytest.mark.asyncio
    async def test_recolor_tag(self, db_session):
        user = await create_user(
            db_session, UserCreate(email="svc3@example.com", password="secret12")
        )
        await db_session.commit()
        tag = await create_tag(db_session, TagCreate(name="Blue", color="#0000FF"), user.id)
        await db_session.commit()

        updated = await update_tag(db_session, tag.id, TagUpdate(color="#00FF00"), user.id)
        assert updated.color == "#00FF00"

    @pytest.mark.asyncio
    async def test_delete_tag_returns_affected_count(self, db_session):
        user = await create_user(
            db_session, UserCreate(email="svc4@example.com", password="secret12")
        )
        await db_session.commit()
        tag = await create_tag(db_session, TagCreate(name="DeleteMe", color="#000000"), user.id)
        await db_session.commit()

        affected = await delete_tag(db_session, tag.id, user.id)
        # No blocks yet, so affected should be 0
        assert affected == 0

        existing = await get_tag_by_name(db_session, "DeleteMe", user.id)
        assert existing is None

    @pytest.mark.asyncio
    async def test_tags_are_scoped_to_user(self, db_session):
        u1 = await create_user(db_session, UserCreate(email="u1@example.com", password="secret12"))
        u2 = await create_user(db_session, UserCreate(email="u2@example.com", password="secret12"))
        await db_session.commit()

        await create_tag(db_session, TagCreate(name="ForU1", color="#111111"), u1.id)
        await create_tag(db_session, TagCreate(name="ForU2", color="#222222"), u2.id)
        await db_session.commit()

        u1_tags = await get_tags_for_user(db_session, u1.id)
        u2_tags = await get_tags_for_user(db_session, u2.id)

        assert len(u1_tags) == 1
        assert u1_tags[0].name == "ForU1"
        assert len(u2_tags) == 1
        assert u2_tags[0].name == "ForU2"


class TestTagAPI:
    @pytest.mark.asyncio
    async def test_create_tag_via_api(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/tags",
                json={"name": "API Study", "color": "#FF0000"},
                headers=Headers(headers),
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "API Study"

    @pytest.mark.asyncio
    async def test_list_tags_via_api(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create a tag first
            await client.post(
                "/tags",
                json={"name": "ListTest", "color": "#FF0000"},
                headers=Headers(headers),
            )
            resp = await client.get("/tags", headers=Headers(headers))
        assert resp.status_code == 200
        tags = resp.json()
        assert len(tags) >= 1
        assert any(t["name"] == "ListTest" for t in tags)


class TestTagAPIPathIdValidation:
    @pytest.mark.asyncio
    async def test_malformed_tag_id_is_422_not_500(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                "/tags/nope",
                json={"name": "x"},
                headers=Headers(headers),
            )
            gone = await client.delete("/tags/nope", headers=Headers(headers))
        assert resp.status_code == 422
        assert gone.status_code == 422

    @pytest.mark.asyncio
    async def test_unknown_tag_id_is_still_404(self, verified_user):
        headers, _ = await verified_user()

        fake_id = str(uuid.uuid4())
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/tags/{fake_id}",
                json={"name": "x"},
                headers=Headers(headers),
            )
            gone = await client.delete(f"/tags/{fake_id}", headers=Headers(headers))
        assert resp.status_code == 404
        assert resp.json()["code"] == "TAG_NOT_FOUND"
        assert gone.status_code == 404
