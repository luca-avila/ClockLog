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

// Dates are plain "YYYY-MM-DD" strings and times "HH:MM:SS" — the plan API
// speaks wall-clock calendar data, never UTC instants (see docs/decisions/008-plan-dates-not-instants.md).

import { api, unwrap, type Schemas } from "./client";

type WireOccurrence = Schemas["EntryOccurrence"];

// A timed entry always carries both times; an all-day entry carries
// neither. Server-enforced on write — the union makes the invariant
// travel with the data so views never assert around it. Built from the
// generated schema, which can only say "string | null" for each time.
export type OccurrenceBase = Omit<WireOccurrence, "all_day" | "start_time" | "end_time">;

export interface TimedOccurrence extends OccurrenceBase {
  all_day: false;
  start_time: string;
  end_time: string;
}

export interface AllDayOccurrence extends OccurrenceBase {
  all_day: true;
}

export type EntryOccurrence = TimedOccurrence | AllDayOccurrence;

export type Entry = Schemas["EntryResponse"];
export type EntryCreate = Schemas["EntryCreate"];
export type EntryUpdate = Schemas["EntryUpdate"];

export async function createEntry(data: EntryCreate): Promise<Entry> {
  return unwrap(api.POST("/plan/entries", { body: data }));
}

export async function fetchOccurrences(from: string, to: string): Promise<EntryOccurrence[]> {
  const rows = await unwrap(api.GET("/plan/entries", { params: { query: { from, to } } }));
  // The one place the wire shape is narrowed into the union.
  return rows as EntryOccurrence[];
}

export async function fetchEntry(id: string): Promise<Entry> {
  return unwrap(api.GET("/plan/entries/{entry_id}", { params: { path: { entry_id: id } } }));
}

export async function updateEntry(id: string, data: EntryUpdate): Promise<Entry> {
  return unwrap(
    api.PATCH("/plan/entries/{entry_id}", { params: { path: { entry_id: id } }, body: data })
  );
}

export async function deleteEntry(id: string): Promise<void> {
  return unwrap(api.DELETE("/plan/entries/{entry_id}", { params: { path: { entry_id: id } } }));
}
