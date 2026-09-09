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
  ended_at: string | null;
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
  return { from: from.toISOString().slice(0, -5) + "Z", to: to.toISOString().slice(0, -5) + "Z" };
}

/** Summed seconds of closed intervals. An open interval contributes 0. */
export function durationSeconds(intervals: readonly IntervalLike[]): number {
  return intervals.reduce((sum, iv) => {
    if (iv.ended_at) {
      return sum + (new Date(iv.ended_at).getTime() - new Date(iv.started_at).getTime()) / 1000;
    }
    return sum;
  }, 0);
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
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
