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

from app.shared.tag.models import Tag
from app.timer.models import Block, BlockInterval
from app.timer.schemas import BlockCreate, BlockUpdate, TagSummary


def compute_duration(block: Block) -> timedelta:
    """Sum the duration of all completed intervals. Paused gaps excluded."""
    total = timedelta()
    for interval in block.intervals:
        if interval.ended_at is not None:
            total += interval.ended_at - interval.started_at
    return total


def validate_history_range(from_dt: datetime, to_dt: datetime) -> None:
    """History speaks instants: tz-aware or rejected (invariant 5)."""
    if from_dt.tzinfo is None or to_dt.tzinfo is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "NAIVE_DATETIME",
                "message": "from and to must be timezone-aware datetimes",
            },
        )
    if from_dt > to_dt:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_RANGE", "message": "from must not be after to"},
        )


async def create_block(db: AsyncSession, data: BlockCreate, user_id: uuid.UUID) -> Block:
    existing = await db.execute(select(Block).where(Block.id == data.id))
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
        kind=data.kind,
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
        .where(
            Block.user_id == user_id,
            Block.kind == "focus",
            Block.label.isnot(None),
            Block.label != "",
        )
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
) -> list[TagSummary]:
    """Aggregate total duration per tag for focus blocks in the given range.

    Breaks are excluded — "4h 10m focus" must not include break time.
    """
    blocks = [
        b for b in await get_blocks_in_range(db, user_id, from_dt, to_dt) if b.kind == "focus"
    ]

    tag_ids = {b.tag_id for b in blocks if b.tag_id is not None}
    tags: dict[uuid.UUID, Tag] = {}
    if tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
        tags = {t.id: t for t in result.scalars().all()}

    totals: dict[uuid.UUID | None, TagSummary] = {}

    for block in blocks:
        row = totals.get(block.tag_id)
        if row is None:
            tag = tags.get(block.tag_id) if block.tag_id else None
            row = TagSummary(
                tag_id=block.tag_id,
                # "Untagged", not "Unlabeled": a label placeholder and a tag
                # placeholder must not share one string across the stack.
                tag_name=tag.name if tag else "Untagged",
                tag_color=tag.color if tag else None,
                total_seconds=0.0,
                block_count=0,
            )
            totals[block.tag_id] = row
        row.total_seconds += compute_duration(block).total_seconds()
        row.block_count += 1

    return list(totals.values())


async def update_block(
    db: AsyncSession, block_id: uuid.UUID, user_id: uuid.UUID, data: BlockUpdate
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

    # model_fields_set, not truthiness: an explicit null must survive as
    # "clear this field" (invariant 10's untag path).
    fields = data.model_fields_set

    if "label" in fields:
        block.label = data.label
    if "tag_id" in fields:
        block.tag_id = data.tag_id
    if "status" in fields:
        block.status = data.status

    if "started_at" in fields or "ended_at" in fields:
        if not block.intervals:
            raise HTTPException(
                status_code=400,
                detail={"code": "NO_INTERVALS", "message": "Block has no intervals"},
            )
        interval = block.intervals[0]
        if "started_at" in fields:
            interval.started_at = data.started_at
            # Block.started_at is the indexed column every history query and
            # the day bucketing run on (invariant 7) — keep it in sync or the
            # block silently stays on its old day after an edit.
            block.started_at = data.started_at
        if "ended_at" in fields:
            # Cross-field and cross-row: the schema cannot see the stored
            # start, so this one rule stays in the service.
            if data.ended_at is not None and data.ended_at < interval.started_at:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "INVALID_INTERVAL",
                        "message": "ended_at must be after started_at",
                    },
                )
            interval.ended_at = data.ended_at

    return block


async def delete_block(db: AsyncSession, block_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(select(Block).where(Block.id == block_id, Block.user_id == user_id))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(
            status_code=404,
            detail={"code": "BLOCK_NOT_FOUND", "message": "Block not found"},
        )
    await db.delete(block)
