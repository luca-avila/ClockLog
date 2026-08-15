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

import type { EntryOccurrence } from "@/lib/api/plan";
import { minutesBetween } from "@/lib/date/week";

export interface LaidOutEntry {
  occ: EntryOccurrence;
  /** Lane index within its overlap cluster (0 = leftmost). */
  lane: number;
  /** Total lanes in this entry's overlap cluster. */
  lanes: number;
}

function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Assign side-by-side lanes to overlapping entries. All-day entries are
 * passed through on lane 0 — they render in the header band, not here.
 */
export function timelineLanes(entries: EntryOccurrence[]): LaidOutEntry[] {
  const timed = [...entries].sort(
    (a, b) =>
      minutes(a.start_time ?? "00:00") - minutes(b.start_time ?? "00:00")
  );

  const result: LaidOutEntry[] = [];
  // Cluster = a run of entries connected by overlap.
  let cluster: EntryOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    for (const occ of cluster) {
      const start = minutes(occ.start_time ?? "00:00");
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = start + minutesBetween(
        occ.start_time ?? "00:00",
        occ.end_time ?? "00:00"
      );
      result.push({ occ, lane, lanes: 1 }); // lanes fixed up below
    }
    const lanes = laneEnds.length;
    for (const item of result.slice(result.length - cluster.length)) {
      item.lanes = lanes;
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const occ of timed) {
    const start = minutes(occ.start_time ?? "00:00");
    const end = start + minutesBetween(occ.start_time ?? "00:00", occ.end_time ?? "00:00");
    if (cluster.length > 0 && start >= clusterEnd) flush();
    cluster.push(occ);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return result;
}
