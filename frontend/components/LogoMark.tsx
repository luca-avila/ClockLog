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

/**
 * The ClockLog mark on its own: the ring that stands in for the "o" of the
 * wordmark, without the text. For avatars, loaders, and anywhere the full
 * wordmark does not fit.
 *
 * One arc, one path — the same geometry `Logo` uses, so the two can never
 * drift apart. The gap opens at 12 o'clock and runs 60° clockwise: that is
 * a countdown ring with a little left to go, which is the whole idea.
 *
 * Stroked in `currentColor` and sized in `em`, so colour and scale are the
 * caller's font decisions and light/dark needs no second variant.
 */

// r=6 in a 16-unit box leaves room for the 2-unit stroke and its round caps.
// Arc start = 60° clockwise from 12 (8 + 6·sin60, 8 − 6·cos60), sweeping
// clockwise the long way (300°) back to 12 o'clock.
export const RING_PATH = "M13.196 5A6 6 0 1 1 8 2";
export const RING_VIEW_BOX = "0 0 16 16";
export const RING_STROKE_WIDTH = 2;

interface LogoMarkProps {
  className?: string;
}

export default function LogoMark({ className = "h-[1em] w-[1em]" }: LogoMarkProps) {
  return (
    <svg
      viewBox={RING_VIEW_BOX}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={RING_STROKE_WIDTH}
      strokeLinecap="round"
      aria-hidden
    >
      <path d={RING_PATH} />
    </svg>
  );
}
