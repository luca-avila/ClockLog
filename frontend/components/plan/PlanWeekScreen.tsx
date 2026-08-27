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

import WeekView from "./WeekView";
import { useOccurrences } from "@/lib/plan/hooks";

export default function PlanWeekScreen({
  week,
  tick,
  today,
}: {
  week: { from: string; to: string };
  tick: string;
  today: string;
}) {
  const occurrences = useOccurrences(week.from, week.to, tick);
  return <WeekView week={week} occurrences={occurrences} today={today} />;
}
