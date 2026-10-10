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

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { EntryOccurrence } from "@/lib/api/plan";
import { occurrencesQuery } from "@/lib/queries/plan";

/** Occurrences for a date range, cached per range. The editor invalidates
 *  every range on save/delete (entryKeys.all), which is what refetches the
 *  screen behind it. Stepping weeks keeps the previous range on screen until
 *  the next arrives; a failed fetch (signed out or offline) is an empty range. */
export function useOccurrences(from: string, to: string): EntryOccurrence[] {
  const { data } = useQuery({ ...occurrencesQuery(from, to), placeholderData: keepPreviousData });
  return data ?? [];
}
