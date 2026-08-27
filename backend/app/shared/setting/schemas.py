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

from pydantic import BaseModel, ConfigDict, Field


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    focus_duration: int | None = Field(default=None, ge=1, alias="focusDuration")
    short_break_duration: int | None = Field(default=None, ge=1, alias="shortBreakDuration")
    long_break_duration: int | None = Field(default=None, ge=1, alias="longBreakDuration")
    blocks_per_cycle: int | None = Field(default=None, ge=1, alias="blocksPerCycle")
    auto_start_breaks: bool | None = Field(default=None, alias="autoStartBreaks")
    auto_start_next: bool | None = Field(default=None, alias="autoStartNext")
    sound: bool | None = None
    notifications: bool | None = None


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    focus_duration: int = Field(alias="focusDuration")
    short_break_duration: int = Field(alias="shortBreakDuration")
    long_break_duration: int = Field(alias="longBreakDuration")
    blocks_per_cycle: int = Field(alias="blocksPerCycle")
    auto_start_breaks: bool = Field(alias="autoStartBreaks")
    auto_start_next: bool = Field(alias="autoStartNext")
    sound: bool
    notifications: bool
