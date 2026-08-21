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
import EmptyWeek from "./EmptyWeek";
import { addDays, formatDuration, hhmm, minutesBetween, weekDays } from "@/lib/date/week";

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
// [Ugly but honest] months/weekdays come from the runtime locale at render;
// for now hard-coded English matches the wireframe labels.

function dayLabel(iso: string, index: number): string {
  return `${DAY_NAMES[index]} ${iso.slice(8)}`;
}

function rangeLabel(from: string, to: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const sameMonth = f.getUTCMonth() === t.getUTCMonth();
  return sameMonth
    ? `${months[f.getUTCMonth()]} ${f.getUTCDate()} – ${t.getUTCDate()}`
    : `${months[f.getUTCMonth()]} ${f.getUTCDate()} – ${months[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

export interface WeekViewProps {
  week: { from: string; to: string };
  occurrences: EntryOccurrence[];
  today?: string;
}

/**
 * SCR-30 week list. Pure mirror of the occurrences data — repeats are
 * already expanded server-side; this component never derives them.
 */
export default function WeekView({ week, occurrences, today }: WeekViewProps) {
  const days = weekDays(week.from);
  const byDay = new Map<string, EntryOccurrence[]>(
    days.map((d) => [d, [] as EntryOccurrence[]])
  );
  for (const o of occurrences) {
    byDay.get(o.date)?.push(o);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      if (a.all_day || b.all_day) return 0; // all-day rows keep order
      return a.start_time.localeCompare(b.start_time);
    });
  }

  const totalMinutes = occurrences
    .filter((o) => !o.all_day)
    .reduce((sum, o) => sum + minutesBetween(o.start_time, o.end_time), 0);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/plan?week=${addDays(week.from, -7)}`}
          aria-label="Previous week"
          className="px-3 py-1 text-neutral-400 hover:text-neutral-700"
        >
          ‹
        </Link>
        <h1 className="text-sm font-medium text-neutral-700">
          {rangeLabel(week.from, week.to)}
        </h1>
        <Link
          href={`/plan?week=${addDays(week.from, 7)}`}
          aria-label="Next week"
          className="px-3 py-1 text-neutral-400 hover:text-neutral-700"
        >
          ›
        </Link>
      </div>

      {occurrences.length === 0 ? (
        <EmptyWeek from={week.from} />
      ) : (
        <>
        <p className="text-xs text-neutral-400 mb-4">
          {occurrences.length} {occurrences.length === 1 ? "entry" : "entries"} ·{" "}
          {formatDuration(totalMinutes)}
        </p>
        <div className="md:grid md:grid-cols-7 md:gap-3 md:divide-x md:divide-neutral-100">
        {days.map((d, i) => {
          const list = byDay.get(d)!;
          const isToday = today === d;
          return (
            <section key={d} className="mb-5 md:mb-0">
              <Link
                href={`/plan/day?date=${d}`}
                className={`flex items-baseline gap-2 border-b border-neutral-100 pb-1 mb-2 ${
                  isToday ? "text-neutral-900" : "text-neutral-500"
                } hover:text-neutral-900`}
              >
                <span className="text-xs uppercase tracking-widest">
                  {dayLabel(d, i)}
                </span>
                {isToday && (
                  <span className="text-[10px] text-neutral-400">· today</span>
                )}
              </Link>

              <ul className="space-y-1.5">
                {list.map((o) => (
                  <li key={`${o.entry_id}-${o.date}`} className="text-sm">
                    <Link
                      href={`/plan?edit=${o.entry_id}`}
                      className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
                    >
                      {o.all_day ? (
                        // All-day band: no time slot, ever.
                        <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                          all day
                        </span>
                      ) : (
                        <span className="text-xs tabular-nums text-neutral-400">
                          {hhmm(o.start_time)}–{hhmm(o.end_time)}
                        </span>
                      )}
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${o.tag_color ? "" : "bg-neutral-300"}`}
                        style={o.tag_color ? { backgroundColor: o.tag_color } : undefined}
                        aria-hidden
                      />
                      {o.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={`/plan?new=1&date=${d}`}
                    className="text-xs text-neutral-300 hover:text-neutral-500"
                  >
                    + Add entry
                  </Link>
                </li>
              </ul>
            </section>
          );
        })}
        </div>
        </>
      )}

      {occurrences.length > 0 && (
        <Link
          href={`/plan?new=1&date=${days[0]}`}
          className="mt-2 block text-center py-2.5 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:border-neutral-400"
        >
          + NEW ENTRY
        </Link>
      )}
    </div>
  );
}
