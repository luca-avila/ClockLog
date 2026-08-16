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

from fastapi import APIRouter, Depends, Query

from app.core.db import DBSession
from app.shared.user.api import get_current_user_dependency
from app.shared.user.schemas import UserResponse
from app.timer.schemas import BlockCreate, BlockResponse, BlockUpdate
from app.timer.service import (
    create_block,
    delete_block,
    get_block_by_id,
    get_blocks_in_range,
    get_recent_labels,
    get_summary_by_tag,
    update_block,
    validate_history_range,
)

router = APIRouter(prefix="/blocks", tags=["blocks"])


@router.get("/recent-labels")
async def recent_labels(
    db: DBSession,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    return await get_recent_labels(db, current_user.id)


@router.get("", response_model=list[BlockResponse])
async def list_blocks(
    db: DBSession,
    # Typed datetime: Pydantic rejects garbage with a 422, never a 500.
    from_: datetime = Query(alias="from"),  # noqa: B008
    to: datetime = Query(alias="to"),  # noqa: B008
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    validate_history_range(from_, to)
    blocks = await get_blocks_in_range(db, current_user.id, from_, to)
    return [BlockResponse.model_validate(b) for b in blocks]


@router.get("/summary")
async def summary(
    db: DBSession,
    from_: datetime = Query(alias="from"),  # noqa: B008
    to: datetime = Query(alias="to"),  # noqa: B008
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    validate_history_range(from_, to)
    return await get_summary_by_tag(db, current_user.id, from_, to)


@router.post("", response_model=BlockResponse, status_code=201)
async def create(
    db: DBSession,
    data: BlockCreate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    block = await create_block(db, data, current_user.id)
    await db.commit()
    # Force-load intervals before returning the ORM object
    # so Pydantic serialization doesn't trigger lazy loading
    block = await get_block_by_id(db, block.id, current_user.id)
    return BlockResponse.model_validate(block)


@router.patch("/{block_id}", response_model=BlockResponse)
async def patch_block(
    db: DBSession,
    block_id: str,
    data: BlockUpdate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    block = await update_block(
        db,
        uuid.UUID(block_id),
        current_user.id,
        # exclude_unset alone: an explicit null must survive as "clear this
        # field" (invariant 10's untag path).
        data.model_dump(exclude_unset=True),
    )
    await db.commit()
    block = await get_block_by_id(db, block.id, current_user.id)
    return BlockResponse.model_validate(block)


@router.delete("/{block_id}", status_code=204)
async def remove_block(
    db: DBSession,
    block_id: str,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    await delete_block(db, uuid.UUID(block_id), current_user.id)
    await db.commit()
