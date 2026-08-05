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
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import desc, select
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


async def get_recent_labels(db: AsyncSession, user_id: uuid.UUID, limit: int = 5) -> list[str]:
    result = await db.execute(
        select(Block.label)
        .where(Block.user_id == user_id, Block.label.isnot(None), Block.label != "")
        .order_by(desc(Block.started_at))
        .limit(limit * 3)
    )
    seen = set()
    labels = []
    for (label,) in result:
        if label not in seen:
            seen.add(label)
            labels.append(label)
            if len(labels) >= limit:
                break
    return labels


async def get_blocks_in_range(
    db: AsyncSession, user_id: uuid.UUID, from_dt: datetime, to_dt: datetime
) -> list[Block]:
    result = await db.execute(
        select(Block)
        .where(
            Block.user_id == user_id,
            Block.started_at >= from_dt,
            Block.started_at < to_dt,
        )
        .order_by(Block.started_at)
        .options(selectinload(Block.intervals))
    )
    return list(result.scalars().all())


async def get_summary_by_tag(
    db: AsyncSession, user_id: uuid.UUID, from_dt: datetime, to_dt: datetime
) -> list[dict]:
    """Aggregate total duration per tag for blocks in the given range."""
    from app.shared.tag.models import Tag

    blocks = await get_blocks_in_range(db, user_id, from_dt, to_dt)

    tag_ids = {b.tag_id for b in blocks if b.tag_id is not None}
    tag_map: dict[uuid.UUID, str] = {}
    if tag_ids:
        tags = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
        tag_map = {t.id: t.name for t in tags.scalars().all()}

    tag_totals: dict[str, dict] = {}

    for block in blocks:
        tag_id = block.tag_id
        tag_name = tag_map.get(tag_id) if tag_id else None
        dur = compute_duration(block)
        key = str(tag_id) if tag_id else "__untagged__"

        if key not in tag_totals:
            tag_totals[key] = {
                "tag_id": str(tag_id) if tag_id else None,
                "tag_name": tag_name or "Unlabeled",
                "total_seconds": 0.0,
                "block_count": 0,
            }
        tag_totals[key]["total_seconds"] += dur.total_seconds()
        tag_totals[key]["block_count"] += 1

    return list(tag_totals.values())


async def update_block(
    db: AsyncSession, block_id: uuid.UUID, user_id: uuid.UUID, data: dict
) -> Block:
    result = await db.execute(
        select(Block)
        .where(Block.id == block_id, Block.user_id == user_id)
        .options(selectinload(Block.intervals))
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(
            status_code=404,
            detail={"code": "BLOCK_NOT_FOUND", "message": "Block not found"},
        )

    for key in {"label", "tag_id"}:
        if key in data:
            setattr(block, key, data[key])

    if "started_at" in data or "ended_at" in data:
        if not block.intervals:
            raise HTTPException(
                status_code=400,
                detail={"code": "NO_INTERVALS", "message": "Block has no intervals"},
            )
        interval = block.intervals[0]
        if "started_at" in data:
            new_start = data["started_at"]
            if not isinstance(new_start, datetime) or new_start.tzinfo is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "NAIVE_DATETIME", "message": "datetime must be timezone-aware"},
                )
            interval.started_at = new_start
        if "ended_at" in data:
            new_end = data["ended_at"]
            if new_end is not None:
                if not isinstance(new_end, datetime) or new_end.tzinfo is None:
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "code": "NAIVE_DATETIME",
                            "message": "datetime must be timezone-aware",
                        },
                    )
                if new_end < interval.started_at:
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "code": "INVALID_INTERVAL",
                            "message": "ended_at must be after started_at",
                        },
                    )
            interval.ended_at = new_end

    return block


async def delete_block(
    db: AsyncSession, block_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(Block).where(Block.id == block_id, Block.user_id == user_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(
            status_code=404,
            detail={"code": "BLOCK_NOT_FOUND", "message": "Block not found"},
        )
    await db.delete(block)
