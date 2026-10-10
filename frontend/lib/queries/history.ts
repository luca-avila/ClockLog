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
import { fetchBlocks, fetchRecentLabels, fetchSummary } from "@/lib/api/history";

/** History's cache keys. `from`/`to` are the UTC instants the client computed
 *  from its own local day (invariant 5) — the key is the range, not a "day". */
export const blockKeys = {
  all: ["blocks"] as const,
  range: (from: string, to: string) => ["blocks", "range", from, to] as const,
  recentLabels: ["blocks", "recent-labels"] as const,
};

/** One range's blocks and its per-tag summary, fetched together: the day
 *  view renders neither without the other. */
export function blockRangeQuery(from: string, to: string) {
  return queryOptions({
    queryKey: blockKeys.range(from, to),
    queryFn: async () => {
      const [blocks, summary] = await Promise.all([
        fetchBlocks(from, to),
        fetchSummary(from, to),
      ]);
      return { blocks, summary };
    },
  });
}

export function recentLabelsQuery() {
  return queryOptions({ queryKey: blockKeys.recentLabels, queryFn: () => fetchRecentLabels() });
}
