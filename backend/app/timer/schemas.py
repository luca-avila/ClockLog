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
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BlockIntervalSchema(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime

    model_config = {"from_attributes": True}


class BlockIntervalIn(BaseModel):
    """One work segment of a finished block, as the client sends it."""

    started_at: datetime
    ended_at: datetime

    @field_validator("started_at", "ended_at")
    @classmethod
    def must_be_timezone_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("datetime must be timezone-aware")
        return v


class BlockCreate(BaseModel):
    # extra="forbid": the old envelope-only create (top-level started_at /
    # ended_at) must 422, not be silently absorbed into one interval.
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    status: Literal["completed", "aborted"]
    kind: Literal["focus", "short_break", "long_break"] = "focus"
    label: str | None = None
    tag_id: uuid.UUID | None = None
    # A finished block always has at least one closed interval; the envelope
    # is derived server-side (started_at = intervals[0].started_at).
    intervals: list[BlockIntervalIn] = Field(min_length=1)


class BlockUpdate(BaseModel):
    # extra="forbid": the patch body is the whole edit contract, so an
    # unknown key is a client bug, not something to drop silently.
    # Matches plan/schemas.py.
    model_config = ConfigDict(extra="forbid")

    label: str | None = None
    tag_id: uuid.UUID | None = None
    status: Literal["completed", "aborted"] | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None

    @field_validator("started_at", "ended_at")
    @classmethod
    def must_be_timezone_aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("datetime must be timezone-aware")
        return v

    @model_validator(mode="after")
    def non_clearable_fields(self) -> "BlockUpdate":
        # label and tag_id back nullable columns, so an explicit null
        # legitimately clears them (invariant 10). started_at, ended_at and
        # status are NOT NULL-backed edges: for them Optional is only how
        # "unset" is spelled, and a literal null would either reach the ORM and
        # 500, or reopen a stored block (invariants 2 and 3 forbid open blocks).
        for name in ("started_at", "ended_at", "status"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be cleared")
        return self


class BlockResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    kind: str
    label: str | None
    tag_id: uuid.UUID | None
    started_at: datetime
    intervals: list[BlockIntervalSchema]

    model_config = {"from_attributes": True}

    @field_validator("intervals", mode="before")
    @classmethod
    def chronological_intervals(cls, value: object) -> object:
        # SQL doesn't order the collection, but the API contract does:
        # clients derive the block envelope from first/last.
        if isinstance(value, list):
            return sorted(value, key=lambda iv: iv.started_at)
        return value


class TagSummary(BaseModel):
    """One row of GET /blocks/summary. Mirrored in frontend/lib/api/history.ts."""

    tag_id: uuid.UUID | None
    tag_name: str
    tag_color: str | None
    total_seconds: float
    block_count: int
