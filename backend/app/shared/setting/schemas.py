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

from pydantic import BaseModel


class SettingsUpdate(BaseModel):
    focus_duration: int | None = None
    short_break_duration: int | None = None
    long_break_duration: int | None = None
    blocks_per_cycle: int | None = None
    auto_start_breaks: bool | None = None
    auto_start_next: bool | None = None
    sound: bool | None = None
    notifications: bool | None = None


class SettingsResponse(BaseModel):
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    blocks_per_cycle: int
    auto_start_breaks: bool
    auto_start_next: bool
    sound: bool
    notifications: bool

    model_config = {"from_attributes": True}
