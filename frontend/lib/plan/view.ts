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

import { isCalendarDate, weekBounds } from "@/lib/date/week";

/** The plan screens' search params, as the router hands them over after
 *  `parsePlanSearch` has dropped anything malformed. Typed: a Link that
 *  writes a param this shape does not have fails `tsc`. */
export interface PlanSearch {
  week?: string;
  date?: string;
  new?: 1;
  edit?: string;
  hour?: number;
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
  sheet: EntrySheetMode | null;
}

/** Absent, empty, non-numeric, non-integer, or outside 0..23 -> undefined.
 *  The router hands over `?hour=9` as the number 9 but a hand-typed oddity
 *  as a string; Number("") and Number(" ") are 0, so blank strings must be
 *  rejected before the numeric check, or a link with no hour would prefill
 *  00:00. */
function readHour(raw: unknown): number | undefined {
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 23) return undefined;
  return n;
}

/** validateSearch for both plan routes: the one place URL input is trusted. */
export function parsePlanSearch(raw: Record<string, unknown>): PlanSearch {
  const out: PlanSearch = {};
  if (isCalendarDate(raw.week)) out.week = raw.week;
  if (isCalendarDate(raw.date)) out.date = raw.date;
  if (raw.new === 1 || raw.new === "1") out.new = 1;
  if (typeof raw.edit === "string" && raw.edit !== "") out.edit = raw.edit;
  const hour = readHour(raw.hour);
  if (hour !== undefined) out.hour = hour;
  return out;
}

export function readPlanView(search: PlanSearch, today: string): PlanView {
  const date = search.date ?? today;
  const week = weekBounds(search.week ?? today);

  let sheet: EntrySheetMode | null = null;
  if (search.edit) {
    sheet = { kind: "edit", entryId: search.edit };
  } else if (search.new === 1) {
    sheet = { kind: "create", date, hour: search.hour ?? null };
  }

  return { today, date, week, sheet };
}
