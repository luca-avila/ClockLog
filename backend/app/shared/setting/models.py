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

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import Base


class UserSetting(Base):
    __tablename__ = "user_setting"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    focus_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    short_break_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    long_break_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    blocks_per_cycle: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    auto_start_breaks: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_start_next: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sound: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
