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

from fastapi import APIRouter, Depends

from app.core.db import DBSession
from app.shared.setting.schemas import SettingsResponse, SettingsUpdate
from app.shared.setting.service import get_or_create_settings, update_settings
from app.shared.user.api import get_current_user_dependency
from app.shared.user.schemas import UserResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get(
    db: DBSession,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    s = await get_or_create_settings(db, current_user.id)
    await db.commit()
    return s


@router.put("", response_model=SettingsResponse)
async def update(
    db: DBSession,
    data: SettingsUpdate,
    current_user: UserResponse = Depends(get_current_user_dependency),  # noqa: B008
):
    s = await update_settings(db, current_user.id, data)
    await db.commit()
    return s
