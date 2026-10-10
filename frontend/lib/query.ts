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

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

/**
 * The app's one QueryClient. Server state (tags, settings, history, entries)
 * lives in its cache; the timer's own state never does — it is client-side by
 * design (invariant 2) and lives in lib/timer/engine.ts.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // An ApiError is the server's answer — asking again changes nothing,
        // and a 401 has already sent the user to /login. Only a transport
        // failure (offline, a dropped connection) earns one more try.
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
      },
      mutations: { retry: false },
    },
  });
}
