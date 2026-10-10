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

// History list grouping for the week/month views (SCR-20). The API speaks a
// single UTC instant range, so bucketing by local day happens here, on the
// client (invariant 5) — and a block belongs to the day it *started*
// (invariant 7), never the day it ended.

import type { BlockData } from "@/lib/api/history";
import { durationSeconds } from "@/lib/date/instant";

/** A block's own start: its first segment, falling back to the envelope. */
export function blockStart(b: BlockData): string {
  return b.intervals[0]?.started_at || b.started_at;
}

/** Local calendar day of an instant as "YYYY-MM-DD" — zero-padded so string
 *  order is chronological order. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export interface HistoryDayGroup {
  /** "2026-09-14" — local day of every block in `items`. */
  key: string;
  /** "Mon, Sep 14" */
  label: string;
  /** Finished focus time in this day, breaks excluded like the global line. */
  focusSeconds: number;
  items: BlockData[];
}

/** Buckets blocks by the local day they started, oldest first. */
export function groupByLocalDay(blocks: BlockData[]): HistoryDayGroup[] {
  const byKey = new Map<string, HistoryDayGroup>();

  for (const block of blocks) {
    const start = blockStart(block);
    const key = localDayKey(start);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: new Date(start).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        focusSeconds: 0,
        items: [],
      };
      byKey.set(key, group);
    }
    if (block.kind === "focus") group.focusSeconds += durationSeconds(block.intervals);
    group.items.push(block);
  }

  const groups = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const group of groups) {
    group.items.sort((a, b) => new Date(blockStart(a)).getTime() - new Date(blockStart(b)).getTime());
  }
  return groups;
}

/** Focus seconds per local day, one slot per entry in `days`. Focus-only and
 *  keyed by the local day a block *started*, identical to the day headings
 *  (invariants 5 and 7). */
export function bucketDayFocus(blocks: BlockData[], days: readonly Date[]): number[] {
  const index = new Map(days.map((d, i) => [localDayKey(d.toISOString()), i]));
  const totals = days.map(() => 0);
  for (const block of blocks) {
    if (block.kind !== "focus") continue;
    const slot = index.get(localDayKey(blockStart(block)));
    if (slot === undefined) continue;
    totals[slot] += durationSeconds(block.intervals);
  }
  return totals;
}

// Render-time fallback: a block with no label but a tag shows the tag name.
// `label` stays null, so renaming the tag updates the display and the user
// can still overwrite the label independently.
export function focusName(label: string | null, tagName: string | undefined) {
  return label || tagName || "Unlabeled";
}
