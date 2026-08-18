# Tempo — a timer and weekly planner
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

# Header omits the word this module may never contain (invariant 13).

import uuid
from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.plan.models import Entry
from app.plan.schemas import EntryCreate, EntryOccurrence, EntryUpdate
from app.shared.tag.models import Tag


def _validate_times(all_day: bool, start, end) -> None:
    if all_day and (start is not None or end is not None):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ALL_DAY_HAS_TIMES",
                "message": "An all-day entry cannot carry times",
            },
        )
    if not all_day and (start is None or end is None):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "TIMES_REQUIRED",
                "message": "A timed entry needs both start and end times",
            },
        )


async def create_entry(db: AsyncSession, data: EntryCreate, user_id: uuid.UUID) -> Entry:
    _validate_times(data.all_day, data.start_time, data.end_time)
    entry = Entry(
        name=data.name,
        date=data.date,
        all_day=data.all_day,
        start_time=data.start_time,
        end_time=data.end_time,
        tag_id=data.tag_id,
        repeat_weekly=data.repeat_weekly,
        user_id=user_id,
    )
    db.add(entry)
    return entry


async def get_entry(db: AsyncSession, entry_id: uuid.UUID, user_id: uuid.UUID) -> Entry:
    """Fetch one owned entry (the editor's view of the stored row)."""
    result = await db.execute(select(Entry).where(Entry.id == entry_id, Entry.user_id == user_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Entry not found"},
        )
    return entry


MAX_RANGE_DAYS = 366


def _validate_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_RANGE", "message": "from must not be after to"},
        )
    if (to_date - from_date).days > MAX_RANGE_DAYS:
        # Repeats expand at read time; an unbounded range would expand with them.
        raise HTTPException(
            status_code=422,
            detail={
                "code": "RANGE_TOO_LARGE",
                "message": "Range must not span more than one year",
            },
        )


async def update_entry(
    db: AsyncSession, entry_id: uuid.UUID, data: EntryUpdate, user_id: uuid.UUID
) -> Entry:
    entry = await get_entry(db, entry_id, user_id)
    updates = data.model_dump(exclude_unset=True)
    if any(k in updates for k in ("all_day", "start_time", "end_time")):
        _validate_times(
            updates.get("all_day", entry.all_day),
            updates.get("start_time", entry.start_time),
            updates.get("end_time", entry.end_time),
        )
    for key, value in updates.items():
        setattr(entry, key, value)
    return entry


async def delete_entry(db: AsyncSession, entry_id: uuid.UUID, user_id: uuid.UUID) -> None:
    entry = await get_entry(db, entry_id, user_id)
    await db.delete(entry)


async def list_occurrences(
    db: AsyncSession, user_id: uuid.UUID, from_date: date, to_date: date
) -> list[EntryOccurrence]:
    """Week view: stored entries plus weekly repeats expanded by weekday.

    Repeats are computed at read time — the stored row is the single source
    of truth and there is no materialization to keep consistent.
    """
    _validate_range(from_date, to_date)
    # Exactly the set the loop below keeps, pushed into SQL so the
    # ix_entry_user_id_date index does its job instead of reading the
    # whole table: entries dated in range, plus earlier weekly repeaters.
    result = await db.execute(
        select(Entry).where(
            Entry.user_id == user_id,
            Entry.date <= to_date,
            or_(Entry.repeat_weekly, Entry.date >= from_date),
        )
    )
    all_entries = list(result.scalars().all())

    # Colors ride on occurrences so the views never need a second round trip.
    tags = await db.execute(select(Tag).where(Tag.user_id == user_id))
    tag_colors = {t.id: t.color for t in tags.scalars().all()}

    occurrences: list[EntryOccurrence] = []
    for entry in all_entries:
        if entry.date > to_date:
            continue  # not started yet
        if entry.date >= from_date:
            occurrences.append(_occurrence_of(entry, entry.date, tag_colors))
        if entry.repeat_weekly:
            # +7 preserves the weekday; strictly after the anchor, which the
            # branch above already emitted.
            d = entry.date + timedelta(days=7)
            while d <= to_date:
                if d >= from_date:
                    occurrences.append(_occurrence_of(entry, d, tag_colors))
                d += timedelta(days=7)
    occurrences.sort(key=lambda o: (o.date, o.start_time or time.min))
    return occurrences


def _occurrence_of(entry: Entry, d: date, tag_colors: dict) -> EntryOccurrence:
    return EntryOccurrence(
        entry_id=entry.id,
        name=entry.name,
        date=d,
        all_day=entry.all_day,
        start_time=entry.start_time,
        end_time=entry.end_time,
        tag_id=entry.tag_id,
        tag_color=tag_colors.get(entry.tag_id) if entry.tag_id else None,
        repeat_weekly=entry.repeat_weekly,
    )
