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

from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.db import DBSession
from app.shared.user.api import get_current_user_dependency
from app.shared.user.schemas import UserResponse
from app.timer.schemas import BlockCreate, BlockResponse
from app.timer.service import (
    create_block,
    get_block_by_id,
    get_blocks_in_range,
    get_recent_labels,
    get_summary_by_tag,
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
    from_: str = Query(alias="from"),
    to: str = Query(alias="to"),
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    from_dt = datetime.fromisoformat(from_)
    to_dt = datetime.fromisoformat(to)
    blocks = await get_blocks_in_range(db, current_user.id, from_dt, to_dt)
    return [BlockResponse.model_validate(b) for b in blocks]


@router.get("/summary")
async def summary(
    db: DBSession,
    from_: str = Query(alias="from"),
    to: str = Query(alias="to"),
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    from_dt = datetime.fromisoformat(from_)
    to_dt = datetime.fromisoformat(to)
    return await get_summary_by_tag(db, current_user.id, from_dt, to_dt)


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
