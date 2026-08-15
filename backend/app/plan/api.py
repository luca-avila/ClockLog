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
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.db import DBSession
from app.plan.schemas import (
    EntryCreate,
    EntryOccurrence,
    EntryResponse,
    EntryUpdate,
)
from app.plan.service import (
    create_entry,
    delete_entry,
    get_entry,
    list_occurrences,
    update_entry,
)
from app.shared.user.api import get_current_user_dependency
from app.shared.user.schemas import UserResponse

router = APIRouter(prefix="/plan/entries", tags=["plan"])


@router.post("", response_model=EntryResponse, status_code=201)
async def create(
    db: DBSession,
    data: EntryCreate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    entry = await create_entry(db, data, current_user.id)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("", response_model=list[EntryOccurrence])
async def list_range(
    db: DBSession,
    # Dates, not instants — wall-clock calendar data (build-plan § 7 note).
    from_date: date = Query(alias="from"),  # noqa: B008
    to_date: date = Query(alias="to"),  # noqa: B008
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    return await list_occurrences(db, current_user.id, from_date, to_date)


@router.get("/{entry_id}", response_model=EntryResponse)
async def get_one(
    db: DBSession,
    entry_id: uuid.UUID,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    return await get_entry(db, entry_id, current_user.id)


@router.patch("/{entry_id}", response_model=EntryResponse)
async def update(
    db: DBSession,
    entry_id: uuid.UUID,
    data: EntryUpdate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    entry = await update_entry(db, entry_id, data, current_user.id)
    await db.commit()
    return entry


@router.delete("/{entry_id}", status_code=204)
async def delete(
    db: DBSession,
    entry_id: uuid.UUID,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    await delete_entry(db, entry_id, current_user.id)
    await db.commit()
