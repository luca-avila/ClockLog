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
from datetime import date as _date
from datetime import datetime as _datetime
from datetime import time as _time

from pydantic import BaseModel, ConfigDict, Field


class EntryCreate(BaseModel):
    # extra="forbid": the contract has one date — a multi-day span cannot
    # even be expressed (wireframes § Plan preamble).
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    date: _date
    all_day: bool = False
    start_time: _time | None = None
    end_time: _time | None = None
    tag_id: uuid.UUID | None = None
    repeat_weekly: bool = False


class EntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    date: _date | None = None
    all_day: bool | None = None
    start_time: _time | None = None
    end_time: _time | None = None
    tag_id: uuid.UUID | None = None
    repeat_weekly: bool | None = None


class EntryResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    tag_id: uuid.UUID | None
    name: str
    date: _date
    all_day: bool
    start_time: _time | None
    end_time: _time | None
    repeat_weekly: bool
    created_at: _datetime


class EntryOccurrence(BaseModel):
    """An entry as it appears on one date of a week view."""

    entry_id: uuid.UUID
    name: str
    date: _date
    all_day: bool
    start_time: _time | None
    end_time: _time | None
    tag_id: uuid.UUID | None
    # Shared tag data rides along so views never need a second round trip.
    tag_color: str | None = None
    repeat_weekly: bool
