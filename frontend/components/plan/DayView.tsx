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

import Link from "next/link";
import type { EntryOccurrence } from "@/lib/api/plan";
import { railFor, railPosition, timelineLanes } from "@/lib/plan/layout";
import { addDays, hhmm } from "@/lib/date/week";

const HOUR = 60;

export interface DayViewProps {
  date: string;
  occurrences: EntryOccurrence[];
}

/**
 * SCR-31 day timeline. Overlapping entries get side-by-side lanes
 * (timelineLanes); tapping empty rail space navigates to the editor
 * (S-21) with the hour prefilled.
 */
export default function DayView({ date, occurrences }: DayViewProps) {
  const allDay = occurrences.filter((o) => o.all_day);
  const timed = occurrences.filter((o) => !o.all_day);
  const laid = timelineLanes(timed);
  // The rail stretches to fit outliers — an early or late entry renders at
  // its real time instead of being clamped onto the default window.
  const rail = railFor(timed);

  const hours: number[] = [];
  for (let h = Math.ceil(rail.startMin / HOUR); h * HOUR <= rail.startMin + rail.minutes; h++) {
    hours.push(h);
  }

  const weekday = new Date(`${date}T00:00:00Z`);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/plan/day?date=${addDays(date, -1)}`}
          aria-label="Previous day"
          className="px-3 py-1 text-neutral-400 hover:text-neutral-700"
        >
          ‹
        </Link>
        <h1 className="text-sm font-medium text-neutral-700">
          {weekday.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </h1>
        <Link
          href={`/plan/day?date=${addDays(date, 1)}`}
          aria-label="Next day"
          className="px-3 py-1 text-neutral-400 hover:text-neutral-700"
        >
          ›
        </Link>
      </div>

      {allDay.length > 0 && (
        <ul className="mb-4 rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2 space-y-1">
          {allDay.map((o) => (
            <li key={o.entry_id} className="text-sm">
              <Link
                href={`/plan/day?date=${date}&edit=${o.entry_id}`}
                className="text-neutral-600 flex items-center gap-2"
              >
                <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                  all day
                </span>
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${o.tag_color ? "" : "bg-neutral-300"}`}
                  style={o.tag_color ? { backgroundColor: o.tag_color } : undefined}
                  aria-hidden
                />
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="relative" data-testid="timeline">
        {/* Hour rail: each empty hour is a tap-to-create target. Labels wrap
            past midnight when a late entry extended the rail. */}
        {hours.map((h) => (
          <div key={h} className="flex h-16 border-t border-neutral-100">
            <span className="w-10 shrink-0 -mt-1.5 text-[10px] text-neutral-300 tabular-nums">
              {String(h % 24).padStart(2, "0")}
            </span>
            <Link
              href={`/plan?new=1&date=${date}&hour=${h % 24}`}
              className="flex-1"
              aria-label={`Add entry at ${String(h % 24).padStart(2, "0")}:00`}
            />
          </div>
        ))}

        {/* Timed entries, positioned on the rail */}
        <div className="absolute inset-y-0 left-10 right-0">
          {laid.map(({ occ, lane, lanes, startMin, endMin }) => {
            const pos = railPosition(startMin, endMin, rail);
            if (!pos) return null;
            return (
              <Link
                key={`${occ.entry_id}-${occ.date}`}
                href={`/plan/day?date=${date}&edit=${occ.entry_id}`}
                className="absolute rounded-md border border-neutral-200 bg-white px-2 py-1 overflow-hidden"
                style={{
                  top: `${pos.topPct}%`,
                  height: `${pos.heightPct}%`,
                  minHeight: "28px",
                  left: `${(lane / lanes) * 100}%`,
                  width: `${(1 / lanes) * 100}%`,
                }}
              >
                <p className="text-xs font-medium text-neutral-700 truncate">{occ.name}</p>
                <p className="flex items-center gap-1.5 text-[10px] text-neutral-400 tabular-nums">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${occ.tag_color ? "" : "bg-neutral-300"}`}
                    style={occ.tag_color ? { backgroundColor: occ.tag_color } : undefined}
                    aria-hidden
                  />
                  {hhmm(occ.start_time)} – {hhmm(occ.end_time)}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <Link
        href={`/plan?new=1&date=${date}`}
        className="mt-4 block text-center py-2.5 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:border-neutral-400"
      >
        + NEW ENTRY
      </Link>
    </div>
  );
}
