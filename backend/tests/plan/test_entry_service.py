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
# GNU General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

from datetime import date, time

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.plan.models import Entry
from app.plan.schemas import EntryCreate, EntryUpdate
from app.plan.service import (
    create_entry,
    delete_entry,
    list_entries,
    list_occurrences,
    update_entry,
)
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def user(db_session: AsyncSession):
    u = await create_user(db_session, UserCreate(email="plan@example.com", password="longenough"))
    await db_session.commit()
    return u


def make_create(
    name="Gym",
    day=date(2026, 7, 28),
    all_day=False,
    start=time(18, 30),
    end=time(19, 30),
    **extra,
) -> EntryCreate:
    return EntryCreate(
        name=name, date=day, all_day=all_day, start_time=start, end_time=end, **extra
    )


class TestEntryBelongsToDate:
    async def test_entry_has_date_column_and_no_weekday_column(self):
        cols = {c.name for c in Entry.__table__.columns}
        assert "date" in cols
        assert not any("weekday" in c for c in cols), (
            "An entry belongs to a date (invariant 14), never a weekday"
        )

    async def test_create_and_read_back_on_its_date(self, db_session, user):
        entry = await create_entry(db_session, make_create(), user.id)
        await db_session.commit()
        entries = await list_entries(
            db_session, user.id, date(2026, 7, 27), date(2026, 8, 2)
        )
        assert [e.id for e in entries] == [entry.id]
        assert entries[0].date == date(2026, 7, 28)


class TestRepeatWeekly:
    async def test_is_a_plain_boolean_flag(self):
        col = Entry.__table__.columns["repeat_weekly"]
        assert col.type.python_type is bool

    async def test_no_recurrence_engine_or_rrule_anywhere_under_plan(self):
        from pathlib import Path

        plan_dir = Path(__file__).resolve().parent.parent.parent / "app" / "plan"
        offenders = [
            p.name
            for p in plan_dir.rglob("*.py")
            if "rrule" in p.read_text().lower()
        ]
        assert not offenders, f"recurrence vocabulary found in plan/: {offenders}"

    async def test_occurrences_expand_by_weekday_after_anchor_date(
        self, db_session, user
    ):
        anchor = await create_entry(
            db_session, make_create(day=date(2026, 7, 28), repeat_weekly=True), user.id
        )  # Tuesday
        await db_session.commit()

        week2 = await list_occurrences(
            db_session, user.id, date(2026, 8, 3), date(2026, 8, 9)
        )
        assert [o.date for o in week2] == [date(2026, 8, 4)]  # next Tuesday
        assert week2[0].entry_id == anchor.id

        # The anchor week shows the entry exactly once — the stored row itself.
        week1 = await list_occurrences(
            db_session, user.id, date(2026, 7, 27), date(2026, 8, 2)
        )
        assert [o.date for o in week1] == [date(2026, 7, 28)]

    async def test_non_repeating_entries_do_not_expand(self, db_session, user):
        await create_entry(
            db_session, make_create(day=date(2026, 7, 28), repeat_weekly=False),
            user.id,
        )
        await db_session.commit()
        week2 = await list_occurrences(
            db_session, user.id, date(2026, 8, 3), date(2026, 8, 9)
        )
        assert week2 == []


class TestAllDayAndMultiDay:
    async def test_all_day_entry_on_a_single_date(self, db_session, user):
        entry = await create_entry(
            db_session,
            make_create(name="Trip to Porto", all_day=True, start=None, end=None),
            user.id,
        )
        await db_session.commit()
        assert entry.all_day is True
        assert entry.start_time is None and entry.end_time is None

    async def test_all_day_with_times_is_rejected(self, db_session, user):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await create_entry(
                db_session,
                make_create(all_day=True, start=time(9), end=time(10)),
                user.id,
            )
        assert exc.value.status_code == 422
        assert exc.value.detail["code"] == "ALL_DAY_HAS_TIMES"

    async def test_multi_day_span_cannot_be_expressed(self):
        # A multi-day span is not supported (wireframes § Plan preamble).
        # The contract only knows one date; smuggling an end date is rejected.
        with pytest.raises(ValidationError):
            EntryCreate(
                name="Conference",
                date=date(2026, 7, 28),
                all_day=True,
                start_time=None,
                end_time=None,
                end_date=date(2026, 7, 30),
            )

    async def test_timed_entry_requires_both_times(self, db_session, user):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await create_entry(
                db_session, make_create(start=time(9), end=None), user.id
            )
        assert exc.value.detail["code"] == "TIMES_REQUIRED"

    async def test_entry_spanning_midnight_is_allowed_on_starting_date(
        self, db_session, user
    ):
        # 22:00 – 00:30 belongs to the day it started (same rule as history).
        entry = await create_entry(
            db_session, make_create(start=time(22, 0), end=time(0, 30)), user.id
        )
        await db_session.commit()
        entries = await list_entries(
            db_session, user.id, date(2026, 7, 28), date(2026, 7, 28)
        )
        assert [e.id for e in entries] == [entry.id]


class TestOverlapAllowed:
    async def test_overlapping_entries_coexist(self, db_session, user):
        await create_entry(
            db_session, make_create(name="Office", start=time(9), end=time(17)),
            user.id,
        )
        await create_entry(
            db_session, make_create(name="Call", start=time(15), end=time(16)),
            user.id,
        )
        await db_session.commit()
        entries = await list_entries(
            db_session, user.id, date(2026, 7, 28), date(2026, 7, 28)
        )
        assert len(entries) == 2  # overlap is a fact, not a validation error


class TestNoTimerCouplingInSchema:
    async def test_entry_table_has_no_fk_to_timer_tables(self):
        fks = {fk.target_fullname for fk in Entry.__table__.foreign_keys}
        assert fks == {"user.id", "tag.id"}, (
            "entry may reference only user and tag (invariants 11–12)"
        )

    async def test_no_duration_column_duration_is_derived(self):
        cols = {c.name for c in Entry.__table__.columns}
        assert "duration" not in cols
        assert not any("minutes" in c or "hours" in c for c in cols)


class TestUpdateDelete:
    async def test_update_changes_fields(self, db_session, user):
        entry = await create_entry(db_session, make_create(), user.id)
        await db_session.commit()
        updated = await update_entry(
            db_session, entry.id, EntryUpdate(name="Gym — legs"), user.id
        )
        assert updated.name == "Gym — legs"
        assert updated.date == entry.date

    async def test_update_unknown_entry_404(self, db_session, user):
        import uuid as uuid_mod

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await update_entry(
                db_session, uuid_mod.uuid4(), EntryUpdate(name="x"), user.id
            )
        assert exc.value.status_code == 404
        assert exc.value.detail["code"] == "ENTRY_NOT_FOUND"

    async def test_delete_is_permanent(self, db_session, user):
        entry = await create_entry(db_session, make_create(), user.id)
        await db_session.commit()
        await delete_entry(db_session, entry.id, user.id)
        await db_session.commit()
        assert await list_entries(
            db_session, user.id, date(2026, 7, 27), date(2026, 8, 2)
        ) == []

    async def test_other_users_entries_are_invisible_and_unwritable(
        self, db_session, user
    ):

        from fastapi import HTTPException

        other = await create_user(
            db_session, UserCreate(email="other@example.com", password="longenough")
        )
        await db_session.flush()  # Python-side UUID default applies at flush
        entry = await create_entry(db_session, make_create(), other.id)
        await db_session.commit()

        assert await list_entries(
            db_session, user.id, date(2026, 7, 27), date(2026, 8, 2)
        ) == []
        with pytest.raises(HTTPException) as exc:
            await delete_entry(db_session, entry.id, user.id)
        assert exc.value.status_code == 404

    async def test_deleting_a_tag_leaves_entries_untagged(
        self, db_session, user
    ):
        # Invariant 10, extended to entries now that they exist (G-4: shared tags).
        from app.shared.tag.schemas import TagCreate
        from app.shared.tag.service import create_tag
        from app.shared.tag.service import delete_tag as delete_tag_svc

        tag = await create_tag(db_session, TagCreate(name="Study", color="#22c55e"), user.id)
        entry = await create_entry(
            db_session, make_create(tag_id=tag.id), user.id
        )
        await db_session.commit()

        await delete_tag_svc(db_session, tag.id, user.id)
        await db_session.commit()
        await db_session.refresh(entry)
        assert entry.tag_id is None  # untagged, never deleted


class TestIndex:
    async def test_user_date_index_exists(self):
        indexes = {ix.name for ix in Entry.__table__.indexes}
        assert "ix_entry_user_id_date" in indexes
