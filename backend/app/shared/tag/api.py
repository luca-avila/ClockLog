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

from fastapi import APIRouter, Depends

from app.core.db import DBSession
from app.shared.tag.schemas import TagCreate, TagResponse, TagUpdate
from app.shared.tag.service import create_tag, delete_tag, get_tags_for_user, update_tag
from app.shared.user.api import get_current_user_dependency
from app.shared.user.schemas import UserResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=TagResponse, status_code=201)
async def create(
    db: DBSession,
    data: TagCreate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    tag = await create_tag(db, data, current_user.id)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.get("", response_model=list[TagResponse])
async def list_tags(
    db: DBSession,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    return await get_tags_for_user(db, current_user.id)


@router.patch("/{tag_id}", response_model=TagResponse)
async def update(
    db: DBSession,
    tag_id: str,
    data: TagUpdate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    tag = await update_tag(
        db,
        uuid.UUID(tag_id),
        # exclude_unset alone, matching the other modules' PATCH semantics.
        data.model_dump(exclude_unset=True),
        current_user.id,
    )
    await db.commit()
    return tag


@router.delete("/{tag_id}")
async def delete(
    db: DBSession,
    tag_id: str,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    affected = await delete_tag(db, uuid.UUID(tag_id), current_user.id)
    await db.commit()
    return {"affected": affected}
