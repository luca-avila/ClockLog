// ClockLog — a Pomodoro timer and weekly planner
// Copyright (C) 2024  Luca
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { api, unwrap, type Schemas } from "./client";

/** Mirrors backend SettingsResponse — the camelCase keys are the wire format. */
export type Settings = Schemas["SettingsResponse"];
export type SettingsUpdate = Schemas["SettingsUpdate"];

export async function fetchSettings(): Promise<Settings> {
  return unwrap(api.GET("/settings"));
}

export async function updateSettings(data: SettingsUpdate): Promise<Settings> {
  return unwrap(api.PUT("/settings", { body: data }));
}
