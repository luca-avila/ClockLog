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

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.tag.models import Tag
from app.shared.tag.schemas import TagCreate, TagUpdate


async def create_tag(db: AsyncSession, data: TagCreate, user_id: uuid.UUID) -> Tag:
    existing = await get_tag_by_name(db, data.name, user_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "TAG_EXISTS", "message": "Tag with this name already exists"},
        )
    tag = Tag(name=data.name, color=data.color, user_id=user_id)
    db.add(tag)
    return tag


async def get_tags_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[Tag]:
    result = await db.execute(select(Tag).where(Tag.user_id == user_id))
    return list(result.scalars().all())


async def get_tag_by_name(db: AsyncSession, name: str, user_id: uuid.UUID) -> Tag | None:
    result = await db.execute(
        select(Tag).where(Tag.name == name, Tag.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_tag(
    db: AsyncSession, tag_id: uuid.UUID, data: TagUpdate, user_id: uuid.UUID
) -> Tag:
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(
            status_code=404,
            detail={"code": "TAG_NOT_FOUND", "message": "Tag not found"},
        )
    tag.name = data.name
    tag.color = data.color
    return tag


async def delete_tag(
    db: AsyncSession, tag_id: uuid.UUID, user_id: uuid.UUID
) -> int:
    """Delete a tag and return the count of affected blocks (untagged)."""
    from sqlalchemy import func

    from app.timer.models import Block

    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(
            status_code=404,
            detail={"code": "TAG_NOT_FOUND", "message": "Tag not found"},
        )
    affected = await db.execute(
        select(func.count(Block.id)).where(Block.tag_id == tag_id)
    )
    count = affected.scalar() or 0
    await db.delete(tag)
    return count
