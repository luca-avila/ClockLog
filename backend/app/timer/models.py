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

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import Base


class Block(Base):
    __tablename__ = "block"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    tag_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tag.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        Enum("completed", "aborted", name="block_status"), nullable=False
    )
    # Focus vs break — SCR-20 draws breaks hollow (○) and totals count
    # focus only, so the recorded kind must be a column, not a guess.
    kind: Mapped[str] = mapped_column(
        Enum("focus", "short_break", "long_break", name="block_kind"),
        nullable=False,
        server_default="focus",
    )
    label: Mapped[str | None] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    intervals: Mapped[list["BlockInterval"]] = relationship(
        "BlockInterval", back_populates="block", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_block_user_id_started_at", "user_id", "started_at"),)


class BlockInterval(Base):
    __tablename__ = "block_interval"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    block_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("block.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    block: Mapped["Block"] = relationship("Block", back_populates="intervals")
