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

// Dates are plain "YYYY-MM-DD" strings and times "HH:MM:SS" — the plan API
// speaks wall-clock calendar data, never UTC instants (build-plan § 7 note).

import { apiFetch } from "./client";

export interface EntryOccurrence {
  entry_id: string;
  name: string;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  tag_id: string | null;
  repeat_weekly: boolean;
}

export interface Entry {
  id: string;
  user_id: string;
  tag_id: string | null;
  name: string;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  repeat_weekly: boolean;
  created_at: string;
}

export interface EntryCreate {
  name: string;
  date: string;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  tag_id?: string | null;
  repeat_weekly?: boolean;
}

export interface EntryUpdate {
  name?: string;
  date?: string;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  tag_id?: string | null;
  repeat_weekly?: boolean;
}

export async function createEntry(data: EntryCreate): Promise<Entry> {
  return apiFetch("/plan/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchOccurrences(
  from: string,
  to: string
): Promise<EntryOccurrence[]> {
  return apiFetch(`/plan/entries?from=${from}&to=${to}`);
}

export async function fetchEntry(id: string): Promise<Entry> {
  return apiFetch(`/plan/entries/${id}`);
}

export async function updateEntry(id: string, data: EntryUpdate): Promise<Entry> {
  return apiFetch(`/plan/entries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  return apiFetch(`/plan/entries/${id}`, { method: "DELETE" });
}
