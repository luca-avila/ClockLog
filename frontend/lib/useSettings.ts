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

import { useQuery } from "@tanstack/react-query";
import { type TimerSettings, defaultSettings } from "@/lib/timer/engine";
import { settingsQuery } from "@/lib/queries/settings";

/**
 * Settings shared by the timer and the settings page, read from one cache
 * entry — a change saved on /settings is what the timer reads next. Starts
 * from defaults so the idle screen renders immediately; the server value
 * replaces them when it arrives. Offline or signed out: defaults.
 */
export function useSettings(): { settings: TimerSettings; loading: boolean } {
  const query = useQuery(settingsQuery());
  // isPending, not isLoading: a failed fetch (offline) stops "loading" too,
  // and the defaults below keep the timer usable.
  return { settings: query.data ?? defaultSettings, loading: query.isPending };
}
