// ClockLog — a timer and weekly planner
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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Header omits the word this module may never contain (invariant 13).

import { queryOptions } from "@tanstack/react-query";
import { fetchEntry, fetchOccurrences } from "@/lib/api/plan";

/** Plan cache keys. Dates, not instants (ADR-008). Saving or deleting an
 *  entry invalidates `entryKeys.all`, which refetches every range on screen. */
export const entryKeys = {
  all: ["entries"] as const,
  range: (from: string, to: string) => ["entries", "range", from, to] as const,
  detail: (id: string) => ["entries", "detail", id] as const,
};

export function occurrencesQuery(from: string, to: string) {
  return queryOptions({
    queryKey: entryKeys.range(from, to),
    queryFn: () => fetchOccurrences(from, to),
  });
}

export function entryQuery(id: string) {
  return queryOptions({ queryKey: entryKeys.detail(id), queryFn: () => fetchEntry(id) });
}
