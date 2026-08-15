// Tempo — a Pomodoro timer and weekly planner
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

// Calendar math on plain "YYYY-MM-DD" strings via Date.UTC — a calendar
// date has no timezone, so DST can never shift a boundary. The plan API
// speaks these strings; the timer's instant helpers stay elsewhere.

const DAY_MS = 86_400_000;

export function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUtc(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}

/** Monday-start week containing `iso`: {from: Monday, to: Sunday}. */
export function weekBounds(iso: string): { from: string; to: string } {
  const ts = toUtc(iso);
  // getUTCDay: 0=Sun..6=Sat — days since Monday, wrapping Sunday back a week.
  const sinceMonday = (new Date(ts).getUTCDay() + 6) % 7;
  const from = fromUtc(ts - sinceMonday * DAY_MS);
  return { from, to: addDays(from, 6) };
}

export function weekDays(from: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

/** Wall-clock minutes between two "HH:MM[:SS]" times; end < start spans midnight. */
export function minutesBetween(start: string, end: string): number {
  const p = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = p(end) - p(start);
  return diff <= 0 ? diff + 24 * 60 : diff;
}

/** "34h", "1h 30m", "45m" — the compact form the week summary uses. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
