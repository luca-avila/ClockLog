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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/** `?token=` on the emailed links. The router parses search values as JSON
 *  first, so a token that happens to look like a number arrives as one —
 *  coerce it back rather than reject a working link. */
export function readToken(raw: Record<string, unknown>): { token: string } {
  const t = raw.token;
  return { token: typeof t === "string" ? t : t == null ? "" : String(t) };
}
