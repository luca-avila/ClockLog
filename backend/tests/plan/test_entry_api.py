# ClockLog — a timer and weekly planner
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
# GNU General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def user_headers(verified_user):
    return await verified_user()


@pytest_asyncio.fixture
async def other_headers(verified_user):
    return await verified_user()


def entry_body(**overrides) -> dict:
    body = {
        "name": "Gym",
        "date": "2026-07-28",
        "all_day": False,
        "start_time": "18:30",
        "end_time": "19:30",
        "tag_id": None,
        "repeat_weekly": False,
    }
    body.update(overrides)
    return body


class TestAuthRequired:
    async def test_every_endpoint_is_401_without_token(self, client):
        id_ = str(uuid.uuid4())
        cases = [
            ("POST", "/plan/entries"),
            ("GET", "/plan/entries?from=2026-08-03&to=2026-08-09"),
            ("GET", f"/plan/entries/{id_}"),
            ("PATCH", f"/plan/entries/{id_}"),
            ("DELETE", f"/plan/entries/{id_}"),
        ]
        for method, path in cases:
            kwargs = {"json": {}} if method in ("POST", "PATCH") else {}
            res = await getattr(client, method.lower())(path, **kwargs)
            assert res.status_code == 401, f"{method} {path} -> {res.status_code}"


class TestCreateAndGet:
    async def test_post_creates_entry_201(self, client, user_headers):
        headers, _ = user_headers
        res = await client.post("/plan/entries", json=entry_body(), headers=headers)
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Gym"
        assert body["date"] == "2026-07-28"
        assert body["start_time"] == "18:30:00"
        assert body["repeat_weekly"] is False

    async def test_get_by_id_returns_stored_row(self, client, user_headers):
        headers, _ = user_headers
        created = (await client.post("/plan/entries", json=entry_body(), headers=headers)).json()

        res = await client.get(f"/plan/entries/{created['id']}", headers=headers)
        assert res.status_code == 200
        assert res.json()["id"] == created["id"]
        assert res.json()["date"] == "2026-07-28"  # the anchor, unexpanded


class TestRangeReturnsOccurrences:
    """The decisive test: ?from=&to= returns occurrences, not stored rows."""

    async def test_weekly_entry_anchored_before_range_appears_each_week(self, client, user_headers):
        headers, _ = user_headers
        # Anchored Tuesday Jul 28 — BEFORE the Aug 3–16 range.
        await client.post(
            "/plan/entries",
            json=entry_body(name="Gym", date="2026-07-28", repeat_weekly=True),
            headers=headers,
        )
        # A one-off inside the range.
        await client.post(
            "/plan/entries",
            json=entry_body(name="Dentist", date="2026-08-06"),
            headers=headers,
        )
        # Anchored after the range — must not appear.
        await client.post(
            "/plan/entries",
            json=entry_body(name="Later", date="2026-08-20", repeat_weekly=True),
            headers=headers,
        )

        res = await client.get("/plan/entries?from=2026-08-03&to=2026-08-16", headers=headers)
        assert res.status_code == 200
        occurrences = [(o["date"], o["name"]) for o in res.json()]
        assert sorted(occurrences) == [
            ("2026-08-04", "Gym"),  # Tuesday, week 1
            ("2026-08-06", "Dentist"),
            ("2026-08-11", "Gym"),  # Tuesday, week 2
        ]

        # Same entry_id across occurrences — it is one stored thing, seen twice.
        ids = {o["entry_id"] for o in res.json() if o["name"] == "Gym"}
        assert len(ids) == 1

    async def test_non_repeating_entry_outside_range_absent(self, client, user_headers):
        headers, _ = user_headers
        await client.post("/plan/entries", json=entry_body(date="2026-07-28"), headers=headers)
        res = await client.get("/plan/entries?from=2026-08-03&to=2026-08-09", headers=headers)
        assert res.json() == []


class TestRangeValidation:
    async def test_from_after_to_rejected_with_code(self, client, user_headers):
        headers, _ = user_headers
        res = await client.get("/plan/entries?from=2026-08-10&to=2026-08-03", headers=headers)
        assert res.status_code == 422
        assert res.json()["code"] == "INVALID_RANGE"

    async def test_range_over_one_year_rejected(self, client, user_headers):
        headers, _ = user_headers
        res = await client.get("/plan/entries?from=2025-01-01&to=2026-08-01", headers=headers)
        assert res.status_code == 422
        assert res.json()["code"] == "RANGE_TOO_LARGE"

    async def test_a_full_year_is_still_allowed(self, client, user_headers):
        headers, _ = user_headers
        res = await client.get("/plan/entries?from=2025-01-01&to=2026-01-01", headers=headers)
        assert res.status_code == 200


class TestCrossUser:
    async def test_other_users_entry_is_404_everywhere(self, client, user_headers, other_headers):
        mine, _ = user_headers
        theirs, _ = other_headers
        created = (await client.post("/plan/entries", json=entry_body(), headers=theirs)).json()
        path = f"/plan/entries/{created['id']}"

        res = await client.get(path, headers=mine)
        assert res.status_code == 404
        assert res.json()["code"] == "ENTRY_NOT_FOUND"

        res = await client.patch(path, json={"name": "nope"}, headers=mine)
        assert res.status_code == 404
        assert res.json()["code"] == "ENTRY_NOT_FOUND"

        res = await client.delete(path, headers=mine)
        assert res.status_code == 404
        assert res.json()["code"] == "ENTRY_NOT_FOUND"

    async def test_range_never_leaks_other_users_entries(self, client, user_headers, other_headers):
        mine, _ = user_headers
        theirs, _ = other_headers
        await client.post(
            "/plan/entries",
            json=entry_body(name="Theirs", date="2026-08-06"),
            headers=theirs,
        )
        res = await client.get("/plan/entries?from=2026-08-03&to=2026-08-09", headers=mine)
        assert res.json() == []


class TestUpdateDelete:
    async def test_patch_updates_fields(self, client, user_headers):
        headers, _ = user_headers
        created = (await client.post("/plan/entries", json=entry_body(), headers=headers)).json()

        res = await client.patch(
            f"/plan/entries/{created['id']}", json={"name": "Gym — legs"}, headers=headers
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Gym — legs"
        assert res.json()["date"] == "2026-07-28"  # untouched fields untouched

    async def test_delete_returns_204_and_entry_is_gone(self, client, user_headers):
        headers, _ = user_headers
        created = (await client.post("/plan/entries", json=entry_body(), headers=headers)).json()

        res = await client.delete(f"/plan/entries/{created['id']}", headers=headers)
        assert res.status_code == 204
        res = await client.get(f"/plan/entries/{created['id']}", headers=headers)
        assert res.status_code == 404
        assert res.json()["code"] == "ENTRY_NOT_FOUND"


class TestStructuredErrors:
    async def test_service_error_surfaces_as_coded_json(self, client, user_headers):
        headers, _ = user_headers
        res = await client.post(
            "/plan/entries",
            json=entry_body(all_day=True, start_time="09:00", end_time="10:00"),
            headers=headers,
        )
        assert res.status_code == 422
        assert res.json()["code"] == "ALL_DAY_HAS_TIMES"

    async def test_malformed_body_is_rejected(self, client, user_headers):
        headers, _ = user_headers
        res = await client.post(
            "/plan/entries",
            json={"name": "X", "date": "2026-07-28", "end_date": "2026-07-30"},
            headers=headers,
        )
        assert res.status_code == 422  # extra field forbidden: no multi-day spans
