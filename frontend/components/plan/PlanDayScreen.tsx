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

"use client";

import { useEffect, useState } from "react";
import DayView from "./DayView";
import { useOccurrences } from "@/lib/plan/hooks";

export default function PlanDayScreen({
  date,
  tick,
  today,
}: {
  date: string;
  tick: string;
  today: string;
}) {
  const occurrences = useOccurrences(date, date, tick);
  // Read off the clock on every tick, never accumulated (and null on the
  // server, so the first client render matches the markup it hydrates).
  const [clockMinutes, setClockMinutes] = useState<number | null>(null);
  const isToday = date === today;

  useEffect(() => {
    if (!isToday) return;
    const read = () => {
      const d = new Date();
      setClockMinutes(d.getHours() * 60 + d.getMinutes());
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // Derived, not stored: stepping to another day drops the marker without
  // waiting for an effect to clear it.
  const nowMinutes = isToday ? clockMinutes : null;

  return (
    <DayView date={date} occurrences={occurrences} today={today} nowMinutes={nowMinutes} />
  );
}
