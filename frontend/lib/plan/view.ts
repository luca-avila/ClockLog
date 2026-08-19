// Tempo — a timer and weekly planner
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

import { isCalendarDate, weekBounds } from "@/lib/date/week";

/** Just enough of URLSearchParams to read a view — so this module never
 *  imports next/navigation and stays testable with a plain URLSearchParams. */
export interface ParamReader {
  get(name: string): string | null;
}

/** Moved here from EntrySheet: the URL constructs this, the sheet consumes it. */
export type EntrySheetMode =
  | { kind: "create"; date: string; hour?: number | null }
  | { kind: "edit"; entryId: string };

export interface PlanView {
  today: string;
  /** The day the day screen shows and a new entry defaults to. */
  date: string;
  /** Monday-start bounds of the week the week screen shows. */
  week: { from: string; to: string };
  /** Cache-buster the editor appends on save so the screen behind refetches. */
  tick: string;
  sheet: EntrySheetMode | null;
}

/** Absent, empty, non-numeric, non-integer, or outside 0..23 -> null.
 *  Number(null) is 0, so the absent case must be rejected before the
 *  numeric check, or a link with no hour would prefill 00:00. */
function readHour(params: ParamReader): number | null {
  const raw = params.get("hour");
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

export function readPlanView(params: ParamReader, today: string): PlanView {
  const dateParam = params.get("date");
  const date = isCalendarDate(dateParam) ? dateParam : today;

  const weekParam = params.get("week");
  const week = weekBounds(isCalendarDate(weekParam) ? weekParam : today);

  const tick = params.get("t") ?? "";

  const editId = params.get("edit");
  const isNew = params.get("new") === "1";
  let sheet: EntrySheetMode | null = null;
  if (editId) {
    sheet = { kind: "edit", entryId: editId };
  } else if (isNew) {
    sheet = { kind: "create", date, hour: readHour(params) };
  }

  return { today, date, week, tick, sheet };
}
