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
from datetime import datetime

from pydantic import BaseModel, field_validator


class BlockIntervalSchema(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class BlockCreate(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    status: str
    label: str | None = None
    tag_id: uuid.UUID | None = None

    @field_validator("started_at", "ended_at")
    @classmethod
    def must_be_timezone_aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("datetime must be timezone-aware")
        return v


class BlockResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    label: str | None
    tag_id: uuid.UUID | None
    started_at: datetime
    intervals: list[BlockIntervalSchema]

    model_config = {"from_attributes": True}
