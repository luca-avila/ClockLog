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

import uuid

import pytest
from httpx import ASGITransport, AsyncClient, Headers

from app.main import app
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user


async def _register_and_auth(db_session) -> dict:
    email = f"block-{uuid.uuid4()}@example.com"
    user = await create_user(db_session, UserCreate(email=email, password="secret12"))
    await db_session.commit()
    from app.core.security import create_access_token

    token = create_access_token(data={"sub": user.email})
    return {"Authorization": f"Bearer {token}"}, user


class TestPostBlocks:
    @pytest.mark.asyncio
    async def test_post_block_succeeds(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        block_id = str(uuid.uuid4())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/blocks",
                json={
                    "id": block_id,
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:25:00+00:00",
                    "status": "completed",
                    "label": "debug JWT refresh",
                    "tag_id": None,
                },
                headers=Headers(headers),
            )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_rejects_missing_started_at(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/blocks",
                json={"id": str(uuid.uuid4()), "status": "completed"},
                headers=Headers(headers),
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_same_uuid_is_idempotent(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        block_id = str(uuid.uuid4())
        payload = {
            "id": block_id,
            "started_at": "2026-08-05T12:00:00+00:00",
            "ended_at": "2026-08-05T12:25:00+00:00",
            "status": "completed",
            "label": "test idempotent",
            "tag_id": None,
        }
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r1 = await client.post("/blocks", json=payload, headers=Headers(headers))
            r2 = await client.post("/blocks", json=payload, headers=Headers(headers))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json() == r2.json()

    @pytest.mark.asyncio
    async def test_cannot_write_another_users_block(self, db_session):
        headers1, u1 = await _register_and_auth(db_session)
        headers2, u2 = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        block_id = str(uuid.uuid4())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create block as user 1
            await client.post(
                "/blocks",
                json={
                    "id": block_id,
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:25:00+00:00",
                    "status": "completed",
                    "label": "u1 block",
                    "tag_id": None,
                },
                headers=Headers(headers1),
            )
            # Try to overwrite as user 2 → should be rejected
            resp = await client.post(
                "/blocks",
                json={
                    "id": block_id,
                    "started_at": "2026-08-05T13:00:00+00:00",
                    "ended_at": "2026-08-05T13:25:00+00:00",
                    "status": "completed",
                    "label": "u2 override attempt",
                    "tag_id": None,
                },
                headers=Headers(headers2),
            )
        assert resp.status_code == 403


class TestPatchBlocks:
    @pytest.mark.asyncio
    async def test_patch_can_clear_tag_and_label(self, db_session):
        """An explicit null clears the field — exclude_unset semantics."""
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            tag_resp = await client.post(
                "/tags",
                json={"name": "Work", "color": "#0000FF"},
                headers=Headers(headers),
            )
            tag_id = tag_resp.json()["id"]

            block_id = str(uuid.uuid4())
            await client.post(
                "/blocks",
                json={
                    "id": block_id,
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:25:00+00:00",
                    "status": "completed",
                    "label": "debug JWT refresh",
                    "tag_id": tag_id,
                },
                headers=Headers(headers),
            )

            resp = await client.patch(
                f"/blocks/{block_id}",
                json={"tag_id": None, "label": None},
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tag_id"] is None
        assert body["label"] is None

    @pytest.mark.asyncio
    async def test_patch_absent_fields_untouched(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        block_id = str(uuid.uuid4())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/blocks",
                json={
                    "id": block_id,
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:25:00+00:00",
                    "status": "completed",
                    "label": "keep me",
                    "tag_id": None,
                },
                headers=Headers(headers),
            )
            resp = await client.patch(
                f"/blocks/{block_id}",
                json={"label": "renamed"},
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        assert resp.json()["label"] == "renamed"
        assert resp.json()["status"] == "completed"


class TestHistoryQueryValidation:
    @pytest.mark.asyncio
    async def test_garbage_from_is_422_not_500(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/blocks?from=nonsense&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
            summary = await client.get(
                "/blocks/summary?from=nonsense&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 422
        assert summary.status_code == 422

    @pytest.mark.asyncio
    async def test_naive_datetime_is_422(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 422
        # The app-level handler flattens detail into the body: {"code", ...}
        assert resp.json()["code"] == "NAIVE_DATETIME"

    @pytest.mark.asyncio
    async def test_from_after_to_is_422(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/blocks?from=2026-08-06T00:00:00Z&to=2026-08-05T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_RANGE"

    @pytest.mark.asyncio
    async def test_valid_range_still_works(self, db_session):
        headers, _ = await _register_and_auth(db_session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
