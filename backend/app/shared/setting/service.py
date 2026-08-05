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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.setting.models import UserSetting
from app.shared.setting.schemas import SettingsUpdate


async def get_or_create_settings(db: AsyncSession, user_id: uuid.UUID) -> UserSetting:
    result = await db.execute(
        select(UserSetting).where(UserSetting.user_id == user_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        setting = UserSetting(user_id=user_id)
        db.add(setting)
        try:
            await db.flush()
        except Exception:
            await db.rollback()
            result = await db.execute(
                select(UserSetting).where(UserSetting.user_id == user_id)
            )
            setting = result.scalar_one()
    return setting


async def update_settings(
    db: AsyncSession, user_id: uuid.UUID, data: SettingsUpdate
) -> UserSetting:
    setting = await get_or_create_settings(db, user_id)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(setting, field, value)
    return setting
