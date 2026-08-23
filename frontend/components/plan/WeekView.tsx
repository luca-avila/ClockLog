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
import PlanHeader from "./PlanHeader";
import { addDays, formatDuration, hhmm, minutesBetween, weekDays } from "@/lib/date/week";

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
// [Ugly but honest] months/weekdays come from the runtime locale at render;
// for now the labels are hard-coded English.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const sameMonth = f.getUTCMonth() === t.getUTCMonth();
  return sameMonth
    ? `${MONTHS[f.getUTCMonth()]} ${f.getUTCDate()} – ${t.getUTCDate()}`
    : `${MONTHS[f.getUTCMonth()]} ${f.getUTCDate()} – ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

/** "03" -> "3": the day number carries the emphasis, not its padding. */
function dayNumber(iso: string): string {
  return String(Number(iso.slice(8)));
}

export interface WeekViewProps {
  week: { from: string; to: string };
  occurrences: EntryOccurrence[];
  today?: string;
}

/**
 * SCR-31 week list. Pure mirror of the occurrences data — repeats are
 * already expanded server-side; this component never derives them.
 *
 * One markup for both shapes: a stack of day cards on a phone, the same
 * seven cards side by side from `lg` up. Rendering a mobile list and a
 * desktop grid separately would put every entry in the DOM twice.
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

  function timedMinutes(list: EntryOccurrence[]): number {
    return list
      .filter((o) => !o.all_day)
      .reduce((sum, o) => sum + minutesBetween(o.start_time, o.end_time), 0);
  }

  const totalMinutes = timedMinutes(occurrences);
  const count = occurrences.length;
  // An all-day-only week has entries but no hours; "0m planned" would read
  // as a measurement rather than as the absence of one.
  const meta =
    count === 0
      ? undefined
      : `${count} ${count === 1 ? "entry" : "entries"}` +
        (totalMinutes > 0 ? ` · ${formatDuration(totalMinutes)} planned` : "");

  const todayInWeek = today !== undefined && today >= week.from && today <= week.to;
  const dayTarget = todayInWeek ? today : week.from;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
      <PlanHeader
        eyebrow="Weekly plan"
        title={rangeLabel(week.from, week.to)}
        meta={meta}
        view="week"
        weekHref="/plan"
        dayHref={`/plan/day?date=${dayTarget}`}
        prevHref={`/plan?week=${addDays(week.from, -7)}`}
        nextHref={`/plan?week=${addDays(week.from, 7)}`}
        prevLabel="Previous week"
        nextLabel="Next week"
        currentHref={todayInWeek ? undefined : "/plan"}
        currentLabel="This week"
        newHref={`/plan?new=1&date=${dayTarget}`}
      />

      {count === 0 ? (
        <EmptyWeek from={week.from} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-7 lg:items-start lg:gap-2">
          {days.map((d, i) => {
            const list = byDay.get(d)!;
            const isToday = today === d;
            const minutes = timedMinutes(list);
            return (
              <section
                key={d}
                className={`flex flex-col overflow-hidden rounded-xl border bg-white ${
                  isToday ? "border-neutral-400" : "border-neutral-200"
                }`}
              >
                <Link
                  href={`/plan/day?date=${d}`}
                  className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 transition-colors hover:bg-neutral-50"
                >
                  <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                    {DAY_NAMES[i]}
                  </span>
                  {/* Today is a filled disc, not a color: the sepia palette
                      keeps saturation for tags alone. */}
                  <span
                    className={
                      isToday
                        ? "grid h-6 w-6 place-items-center rounded-full bg-neutral-900 text-[11px] font-medium tabular-nums text-white"
                        : "text-sm tabular-nums text-neutral-700"
                    }
                  >
                    {dayNumber(d)}
                  </span>
                  {minutes > 0 && (
                    <span className="ml-auto text-[11px] tabular-nums text-neutral-400">
                      {formatDuration(minutes)}
                    </span>
                  )}
                </Link>

                <ul className="flex-1 divide-y divide-neutral-100">
                  {list.map((o) => (
                    <li key={`${o.entry_id}-${o.date}`}>
                      <Link
                        href={`/plan?edit=${o.entry_id}`}
                        className="relative flex items-baseline gap-3 py-2.5 pl-5 pr-3 transition-colors hover:bg-neutral-50 lg:flex-col lg:gap-0.5"
                      >
                        {/* The tag reads as a spine down the entry rather
                            than a 6px dot lost against the time. */}
                        <span
                          className={`absolute bottom-2.5 left-2 top-2.5 w-[3px] rounded-full ${
                            o.tag_color ? "" : "bg-neutral-300"
                          }`}
                          style={o.tag_color ? { backgroundColor: o.tag_color } : undefined}
                          aria-hidden
                        />
                        {o.all_day ? (
                          // All-day band: no time slot, ever.
                          <span className="w-[4.75rem] shrink-0 text-[10px] uppercase tracking-widest text-neutral-400 lg:order-2 lg:w-auto">
                            all day
                          </span>
                        ) : (
                          <span className="w-[4.75rem] shrink-0 text-xs tabular-nums text-neutral-500 lg:order-2 lg:w-auto">
                            {hhmm(o.start_time)}–{hhmm(o.end_time)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[15px] text-neutral-900 lg:order-1 lg:w-full lg:text-sm">
                          {o.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/plan?new=1&date=${d}`}
                  className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
                >
                  + Add
                </Link>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
