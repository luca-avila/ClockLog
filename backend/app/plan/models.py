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

# Header omits the word this module may never contain (invariant 13).

import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import Base


class Entry(Base):
    __tablename__ = "entry"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    # Shared vocabulary by decision G-4; SET NULL keeps entries when tags go
    # (invariant 10).
    tag_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tag.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # An entry belongs to a date, never a weekday (invariant 14).
    date: Mapped[date] = mapped_column(Date, nullable=False)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Time-of-day as entered (local wall time); naive by design — a date has
    # no timezone. An end before its start spans midnight and stays on the
    # starting date.
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    # Simple flag, not a recurrence engine (invariant 14).
    repeat_weekly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (Index("ix_entry_user_id_date", "user_id", "date"),)
