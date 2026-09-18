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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Instant math on UTC ISO strings — the timer API speaks instants, never
// dates, and the client alone converts its local day boundaries into the
// from/to ranges history queries use (invariant 5). Calendar dates live in week.ts.

/** Shape of a block interval as the history API returns it. Structural, so
 *  this module never imports lib/api. */
export interface IntervalLike {
  started_at: string;
  ended_at: string;
}

/** Second-precision UTC instant, the shape history queries send: the API
 *  takes instants and the client alone decides where a local day begins. */
function toInstant(d: Date): string {
  return d.toISOString().slice(0, -5) + "Z";
}

/** Local midnight of the day containing `date`. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local midnight of the Monday starting the week containing `anchor`. */
function localWeekStart(anchor: Date): Date {
  // getDay: 0=Sun..6=Sat — days since Monday, wrapping Sunday back a week.
  const sinceMonday = (anchor.getDay() + 6) % 7;
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - sinceMonday);
}

/** The UTC instants bounding the local calendar day containing `date`.
 *  Invariant 5: the client owns this conversion; the server never
 *  reasons about days. */
export function localDayRange(date: Date): { from: string; to: string } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);
  return { from: toInstant(from), to: toInstant(to) };
}

/** The UTC instants bounding the local Monday–Sunday week containing
 *  `anchor`. Same instant pattern as `localDayRange` (invariant 5); the
 *  Monday start deliberately mirrors the plan's week without importing it
 *  (invariant 11). */
export function localWeekRange(anchor: Date): { from: string; to: string } {
  const monday = localWeekStart(anchor);
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return { from: toInstant(monday), to: toInstant(nextMonday) };
}

/** The UTC instants bounding the local calendar month containing `anchor`.
 *  The Date constructor rolls December into January on its own. */
export function localMonthRange(anchor: Date): { from: string; to: string } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  return { from: toInstant(new Date(year, month, 1)), to: toInstant(new Date(year, month + 1, 1)) };
}

/** "Sep 8 – Sep 14" for a week heading; `anchor` is any instant in it. */
export function formatWeekSubtitle(anchor: Date): string {
  const monday = localWeekStart(anchor);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${short(monday)} – ${short(sunday)}`;
}

/** "September 2026" for a month heading. */
export function formatMonthSubtitle(anchor: Date): string {
  return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Summed seconds of closed intervals. A stored block is always closed
 *  (invariants 2 and 3), so every interval carries a real end. */
export function durationSeconds(intervals: readonly IntervalLike[]): number {
  return intervals.reduce(
    (sum, iv) =>
      sum + (new Date(iv.ended_at).getTime() - new Date(iv.started_at).getTime()) / 1000,
    0
  );
}

/** Local wall-clock "HH:MM" for an instant. */
// Padded getHours(), not toLocaleTimeString: with hour12:false V8 renders
// midnight hours as "24:xx".
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "1h 30m" / "45m" from seconds. week.ts has a minutes-based twin;
 *  the two are deliberately not shared (see docs/decisions/009-module-deletability.md). */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** The instant `iso`, moved to wall-clock "HH:MM" on its own local day. */
export function withLocalTime(iso: string, hhmm: string): string {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** "MM:SS" countdown from a millisecond duration. */
export function formatCountdown(ms: number): string {
  // A countdown never owes negative time: clamp so a stale clock can only
  // ever read 00:00, never "-1:-1".
  const s = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
