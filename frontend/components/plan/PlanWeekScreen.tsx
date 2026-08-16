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

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import WeekView from "./WeekView";
import { fetchOccurrences, type EntryOccurrence } from "@/lib/api/plan";
import { localTodayIso, weekBounds } from "@/lib/date/week";

export default function PlanWeekScreen() {
  const params = useSearchParams();
  const weekParam = params.get("week");
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : localTodayIso();
  const week = weekBounds(anchor);
  // Editor saves redirect with a fresh tick so this screen refetches.
  const tick = params.get("t") ?? "";

  const [occurrences, setOccurrences] = useState<EntryOccurrence[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchOccurrences(week.from, week.to)
      .then((data) => {
        if (!cancelled) setOccurrences(data);
      })
      .catch(() => {
        if (!cancelled) setOccurrences([]); // signed out or offline: empty week
      });
    return () => {
      cancelled = true;
    };
  }, [week.from, week.to, tick]);

  return <WeekView week={week} occurrences={occurrences} today={localTodayIso()} />;
}
