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

import type { EntryOccurrence, TimedOccurrence } from "@/lib/api/plan";
import { minutesBetween, minuteOfDay } from "@/lib/date/week";

export interface LaidOutEntry {
  occ: TimedOccurrence;
  /** Lane index within its overlap cluster (0 = leftmost). */
  lane: number;
  /** Total lanes in this entry's overlap cluster. */
  lanes: number;
  /** Minute of day the entry starts at. */
  startMin: number;
  /** End in extended minutes-of-day — exceeds 24h when it spans midnight. */
  endMin: number;
}

export interface RailSpec {
  /** Minute of day the rail starts at. */
  startMin: number;
  /** Total minutes the rail spans. */
  minutes: number;
}

export const DEFAULT_RAIL: RailSpec = { startMin: 7 * 60, minutes: 15 * 60 };

/**
 * Rail bounds expanded to include every timed entry. An entry outside the
 * default 07:00–22:00 window extends the rail so it renders at its real
 * time — clamping it to the edge would show a time the user did not enter.
 * Midnight-spanning entries may push the end past 24:00; hour labels wrap.
 */
export function railFor(entries: EntryOccurrence[]): RailSpec {
  let start = DEFAULT_RAIL.startMin;
  let end = start + DEFAULT_RAIL.minutes;
  for (const occ of entries) {
    if (occ.all_day) continue; // all-day entries render in the header band
    const s = minuteOfDay(occ.start_time);
    const e = s + minutesBetween(occ.start_time, occ.end_time);
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  return { startMin: start, minutes: end - start };
}

/**
 * Percent geometry for an entry on the rail. `endMin` is the entry's end in
 * extended minutes-of-day (may exceed 24h when it spans midnight). Returns
 * null only for degenerate input (end <= start) — never clamps.
 */
export function railPosition(
  startMin: number,
  endMin: number,
  rail: RailSpec
): { topPct: number; heightPct: number } | null {
  if (!(endMin > startMin)) return null;
  return {
    topPct: ((startMin - rail.startMin) / rail.minutes) * 100,
    heightPct: ((endMin - startMin) / rail.minutes) * 100,
  };
}

/** Assign side-by-side lanes to overlapping timed entries. */
export function timelineLanes(entries: TimedOccurrence[]): LaidOutEntry[] {
  // A timed entry always has both times — the TimedOccurrence type carries
  // the server's invariant, so no fallbacks or assertions here.
  const timed = entries
    .map((occ) => {
      const startMin = minuteOfDay(occ.start_time);
      return {
        occ,
        startMin,
        endMin: startMin + minutesBetween(occ.start_time, occ.end_time),
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // Pass 1 — group into overlap clusters. A new cluster starts when an
  // entry begins at or after the running cluster end (entries that merely
  // touch are not the same cluster).
  const clusters: { items: typeof timed; end: number }[] = [];
  for (const item of timed) {
    const last = clusters[clusters.length - 1];
    if (!last || last.end <= item.startMin) {
      clusters.push({ items: [item], end: item.endMin });
    } else {
      last.items.push(item);
      last.end = Math.max(last.end, item.endMin);
    }
  }

  // Pass 2 — lay out each cluster independently and build final entries
  // with the correct lanes value from the start (no placeholder mutation).
  return clusters.flatMap(({ items }) => {
    const laneEnds: number[] = [];
    const assignments = items.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = item.endMin;
      return lane;
    });
    const totalLanes = laneEnds.length;
    return items.map((item, i) => ({
      occ: item.occ,
      lane: assignments[i],
      lanes: totalLanes,
      startMin: item.startMin,
      endMin: item.endMin,
    }));
  });
}
