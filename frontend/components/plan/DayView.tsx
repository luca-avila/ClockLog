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

import Link from "next/link";
import type { EntryOccurrence } from "@/lib/api/plan";
import PlanHeader from "./PlanHeader";
import { railFor, railPosition, timelineLanes } from "@/lib/plan/layout";
import { addDays, formatDuration, hhmm, minutesBetween, weekBounds } from "@/lib/date/week";

const HOUR = 60;
/** One hour of rail, in pixels. Everything on the rail — labels, hour
 *  lines, tap targets, the now marker — is placed from this one number. */
const PX_PER_HOUR = 56;
/** Below this height an entry has room for its name or its times, not both. */
const TIME_LINE_MIN_PX = 44;

export interface DayViewProps {
  date: string;
  occurrences: EntryOccurrence[];
  /** The user's local today, so the header can offer the way back to it. */
  today?: string;
  /** Minute of day, for the now marker. Absent on any day but today. */
  nowMinutes?: number | null;
}

/**
 * SCR-31 day timeline. Overlapping entries get side-by-side lanes
 * (timelineLanes); tapping empty rail space navigates to the editor
 * (S-21) with the hour prefilled.
 */
export default function DayView({ date, occurrences, today, nowMinutes }: DayViewProps) {
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

  // The rail is sized in pixels and everything on it is placed from the same
  // geometry, so an hour line and an entry that start at 09:00 land on the
  // same row however the rail was stretched.
  const railHeight = (rail.minutes / HOUR) * PX_PER_HOUR;
  const topPx = (minute: number) => ((minute - rail.startMin) / HOUR) * PX_PER_HOUR;

  const day = new Date(`${date}T00:00:00Z`);
  const totalMinutes = timed.reduce(
    (sum, o) => sum + minutesBetween(o.start_time, o.end_time),
    0
  );
  const count = occurrences.length;
  const meta =
    count === 0
      ? "Nothing planned"
      : `${count} ${count === 1 ? "entry" : "entries"}` +
        (totalMinutes > 0 ? ` · ${formatDuration(totalMinutes)} planned` : "");

  const showNow =
    nowMinutes != null &&
    nowMinutes >= rail.startMin &&
    nowMinutes <= rail.startMin + rail.minutes;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-10">
      <PlanHeader
        eyebrow="Planned day"
        title={day.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })}
        meta={meta}
        view="day"
        weekHref={`/plan?week=${weekBounds(date).from}`}
        dayHref={`/plan/day?date=${date}`}
        prevHref={`/plan/day?date=${addDays(date, -1)}`}
        nextHref={`/plan/day?date=${addDays(date, 1)}`}
        prevLabel="Previous day"
        nextLabel="Next day"
        currentHref={today === undefined || today === date ? undefined : "/plan/day"}
        currentLabel="Today"
        newHref={`/plan?new=1&date=${date}`}
      />

      {allDay.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {allDay.map((o) => (
            <li key={o.entry_id}>
              <Link
                href={`/plan/day?date=${date}&edit=${o.entry_id}`}
                className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pl-2.5 pr-3.5 text-sm text-neutral-800 transition-colors hover:border-neutral-400"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${o.tag_color ? "" : "bg-neutral-300"}`}
                  style={o.tag_color ? { backgroundColor: o.tag_color } : undefined}
                  aria-hidden
                />
                <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                  all day
                </span>
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div
        className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white"
        style={{ height: `${railHeight}px` }}
        data-testid="timeline"
      >
        {/* Hour lines and their labels. Each empty hour is a tap-to-create
            target; labels wrap past midnight when a late entry extended
            the rail. */}
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0" style={{ top: `${topPx(h * HOUR)}px` }}>
            <div className="flex items-start">
              <span className="w-12 shrink-0 -translate-y-1/2 pl-3 text-[11px] tabular-nums text-neutral-400">
                {String(h % 24).padStart(2, "0")}
              </span>
              <span className="mt-0 h-px flex-1 bg-neutral-100" aria-hidden />
            </div>
            <Link
              href={`/plan?new=1&date=${date}&hour=${h % 24}`}
              className="absolute left-12 right-0 top-0"
              style={{ height: `${PX_PER_HOUR}px` }}
              aria-label={`Add entry at ${String(h % 24).padStart(2, "0")}:00`}
            />
          </div>
        ))}

        {/* Timed entries, positioned on the rail */}
        <div className="absolute inset-y-0 left-12 right-1">
          {laid.map(({ occ, lane, lanes, startMin, endMin }) => {
            const pos = railPosition(startMin, endMin, rail);
            if (!pos) return null;
            const heightPx = ((endMin - startMin) / HOUR) * PX_PER_HOUR;
            return (
              <Link
                key={`${occ.entry_id}-${occ.date}`}
                href={`/plan/day?date=${date}&edit=${occ.entry_id}`}
                className="absolute overflow-hidden rounded-lg border border-neutral-200 bg-white pl-3 pr-2 py-1 transition-colors hover:border-neutral-400"
                style={{
                  top: `${pos.topPct}%`,
                  height: `${pos.heightPct}%`,
                  minHeight: "24px",
                  left: `${(lane / lanes) * 100}%`,
                  width: `${(1 / lanes) * 100}%`,
                }}
              >
                {/* Tag as a spine on the leading edge — legible at a glance
                    where a dot inside the card was not. */}
                <span
                  className={`absolute bottom-1 left-1 top-1 w-[3px] rounded-full ${occ.tag_color ? "" : "bg-neutral-300"}`}
                  style={occ.tag_color ? { backgroundColor: occ.tag_color } : undefined}
                  aria-hidden
                />
                <p className="truncate text-[13px] font-medium leading-tight text-neutral-900">
                  {occ.name}
                </p>
                {heightPx >= TIME_LINE_MIN_PX && (
                  <p className="mt-0.5 text-[11px] tabular-nums leading-tight text-neutral-500">
                    {hhmm(occ.start_time)} – {hhmm(occ.end_time)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        {/* Now marker: only ever on today, and only inside the rail. */}
        {showNow && (
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center"
            style={{ top: `${topPx(nowMinutes)}px` }}
            aria-hidden
          >
            <span className="ml-11 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
            <span className="h-px flex-1 bg-neutral-900/40" />
          </div>
        )}
      </div>
    </div>
  );
}
