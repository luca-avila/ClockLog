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

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOccurrences, type EntryOccurrence } from "@/lib/api/plan";
import { localTodayIso } from "@/lib/date/week";
import { readPlanView, type PlanView } from "@/lib/plan/view";

/** The view the current URL asks for. Only the two plan pages call this —
 *  screens take what they need as props. */
export function usePlanView(): PlanView {
  const params = useSearchParams();
  return readPlanView(params, localTodayIso());
}

/** Occurrences for a date range, refetched when `tick` changes. Owns the
 *  cancel flag; a failed fetch (signed out or offline) yields an empty range. */
export function useOccurrences(from: string, to: string, tick: string): EntryOccurrence[] {
  const [occurrences, setOccurrences] = useState<EntryOccurrence[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchOccurrences(from, to)
      .then((data) => {
        if (!cancelled) setOccurrences(data);
      })
      .catch(() => {
        if (!cancelled) setOccurrences([]); // signed out or offline: empty range
      });
    return () => {
      cancelled = true;
    };
    // EntrySheet closes save/delete via withTick() (lib/plan/urls.ts); the
    // fresh t= param becomes this tick, which is what makes this refetch.
  }, [from, to, tick]);

  return occurrences;
}
