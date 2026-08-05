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
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.timer.models import Block, BlockInterval
from app.timer.schemas import BlockCreate


def compute_duration(block: Block) -> timedelta:
    """Sum the duration of all completed intervals. Paused gaps excluded."""
    total = timedelta()
    for interval in block.intervals:
        if interval.ended_at is not None:
            total += interval.ended_at - interval.started_at
    return total


async def create_block(db: AsyncSession, data: BlockCreate, user_id: uuid.UUID) -> Block:
    existing = await db.execute(
        select(Block).where(Block.id == data.id)
    )
    block = existing.scalar_one_or_none()
    if block:
        if block.user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail={"code": "BLOCK_OWNED_BY_OTHER", "message": "Block belongs to another user"},
            )
        return block

    interval = BlockInterval(
        id=uuid.uuid4(),
        started_at=data.started_at,
        ended_at=data.ended_at,
    )
    block = Block(
        id=data.id,
        user_id=user_id,
        status=data.status,
        label=data.label,
        tag_id=data.tag_id,
        started_at=data.started_at,
        intervals=[interval],
    )
    db.add(block)
    return block


async def get_block_by_id(
    db: AsyncSession, block_id: uuid.UUID, user_id: uuid.UUID
) -> Block | None:
    result = await db.execute(
        select(Block)
        .where(Block.id == block_id, Block.user_id == user_id)
        .options(selectinload(Block.intervals))
    )
    return result.scalar_one_or_none()
