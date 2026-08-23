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

/**
 * The nav icon set (SCR-01). Drawn rather than typed: the emoji glyphs the
 * two navs used before had different metrics and weight in every browser,
 * so the rail never lined up. Stroked in currentColor, so an item's colour
 * is decided once by its own state.
 */

export type NavIconName = "timer" | "history" | "plan" | "tags" | "settings";

const PATHS: Record<NavIconName, React.ReactNode> = {
  timer: (
    <>
      <circle cx="8" cy="9" r="5.25" />
      <path d="M8 6.5V9l1.75 1.25" />
      <path d="M6.25 1.75h3.5" />
    </>
  ),
  history: (
    <>
      <path d="M2 3.75h12" />
      <path d="M2 8h12" />
      <path d="M2 12.25h7.5" />
    </>
  ),
  plan: (
    <>
      <rect x="2" y="2.75" width="12" height="11.5" rx="1.75" />
      <path d="M2 6.25h12" />
      <path d="M6.25 6.25v8" />
      <path d="M5 1.5v2.5M11 1.5v2.5" />
    </>
  ),
  tags: (
    <>
      <path d="M2.25 7.4V3a.75.75 0 0 1 .75-.75h4.4a1 1 0 0 1 .71.3l5.2 5.2a1 1 0 0 1 0 1.42l-4.4 4.4a1 1 0 0 1-1.42 0l-5.2-5.2a1 1 0 0 1-.04-.97Z" />
      <circle cx="5.25" cy="5.25" r="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.75v1.6M8 12.65v1.6M14.25 8h-1.6M3.35 8h-1.6M12.42 3.58l-1.13 1.13M4.71 11.29l-1.13 1.13M12.42 12.42l-1.13-1.13M4.71 4.71 3.58 3.58" />
    </>
  ),
};

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
