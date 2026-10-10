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

import { queryOptions } from "@tanstack/react-query";
import { fetchTags } from "@/lib/api/tags";

/** Tags are read by both feature modules, so their cache key is shared — a
 *  mutation anywhere invalidates every picker at once. */
export const tagKeys = {
  all: ["tags"] as const,
};

export function tagsQuery() {
  return queryOptions({ queryKey: tagKeys.all, queryFn: () => fetchTags() });
}
