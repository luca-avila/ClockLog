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

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.models import Base
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
    result = await db.execute(select(Tag).where(Tag.name == name, Tag.user_id == user_id))
    return result.scalar_one_or_none()


# Single home for tag tenancy: any service verifying a client-supplied tag_id
# calls this instead of keeping a private copy.
async def assert_tag_owned(db: AsyncSession, tag_id: uuid.UUID | None, user_id: uuid.UUID) -> None:
    if tag_id is None:
        return
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    if result.scalar_one_or_none() is None:
        # Same answer as a nonexistent tag: the endpoint must not be usable
        # to probe another account's tag ids.
        raise HTTPException(
            status_code=404,
            detail={"code": "TAG_NOT_FOUND", "message": "Tag not found"},
        )


async def update_tag(
    db: AsyncSession, tag_id: uuid.UUID, data: TagUpdate, user_id: uuid.UUID
) -> Tag:
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(
            status_code=404,
            detail={"code": "TAG_NOT_FOUND", "message": "Tag not found"},
        )
    # exclude_unset alone, matching the other modules' PATCH semantics.
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    return tag


async def delete_tag(db: AsyncSession, tag_id: uuid.UUID, user_id: uuid.UUID) -> int:
    """Delete a tag; return affected rows across whatever tables carry a
    tag_id. Counted via metadata, not feature-model imports — shared/ must
    stay loadable with either feature module deleted (invariant 11)."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(
            status_code=404,
            detail={"code": "TAG_NOT_FOUND", "message": "Tag not found"},
        )
    total = 0
    for table in Base.metadata.tables.values():
        col = table.columns.get("tag_id")
        if col is None:
            continue
        affected = await db.execute(select(func.count()).select_from(table).where(col == tag_id))
        total += affected.scalar() or 0
    await db.delete(tag)
    return total
