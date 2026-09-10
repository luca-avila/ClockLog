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
from httpx import Headers


class TestRecentLabels:
    @pytest.mark.asyncio
    async def test_deduped_most_recent_first(self, client, verified_user):
        headers, _ = await verified_user()

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
                    "status": "completed",
                    "label": label,
                    "tag_id": None,
                    "intervals": [
                        {
                            "started_at": started,
                            # Ends don't matter for label autocomplete, but a
                            # finished block must carry a closed interval.
                            "ended_at": "2026-08-05T23:59:00+00:00",
                        }
                    ],
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
    async def test_scoped_to_user(self, client, verified_user):
        headers1, _ = await verified_user()
        headers2, _ = await verified_user()

        await client.post(
            "/blocks",
            json={
                "id": str(uuid.uuid4()),
                "status": "completed",
                "label": "user1-label",
                "tag_id": None,
                "intervals": [
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:25:00+00:00",
                    }
                ],
            },
            headers=Headers(headers1),
        )

        resp = await client.get("/blocks/recent-labels", headers=Headers(headers2))
        assert resp.status_code == 200
        labels = resp.json()
        assert "user1-label" not in labels
