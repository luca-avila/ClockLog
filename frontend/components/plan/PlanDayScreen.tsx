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
import DayView from "./DayView";
import { fetchOccurrences, type EntryOccurrence } from "@/lib/api/plan";
import { localTodayIso } from "@/lib/date/week";

export default function PlanDayScreen() {
  const params = useSearchParams();
  const dateParam = params.get("date");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? dateParam!
    : localTodayIso();
  // Editor saves redirect with a fresh tick so this screen refetches.
  const tick = params.get("t") ?? "";

  const [occurrences, setOccurrences] = useState<EntryOccurrence[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchOccurrences(date, date)
      .then((data) => {
        if (!cancelled) setOccurrences(data);
      })
      .catch(() => {
        if (!cancelled) setOccurrences([]);
      });
    return () => {
      cancelled = true;
    };
  }, [date, tick]);

  return <DayView date={date} occurrences={occurrences} />;
}
