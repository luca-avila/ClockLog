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

import LogoMark from "./LogoMark";

/**
 * The ClockLog wordmark: "cl" and "cklog" set in Geist, with the countdown
 * ring of `LogoMark` standing in for the first "o".
 *
 * Stateless. It carries no size of its own — everything below
 * is in `em`, so the caller sets `font-size` (and `color`, via
 * `currentColor`) and the ring follows. That is also why light and dark need
 * no second variant.
 */

// Pinned to Geist at 500 rather than inheriting: the wordmark keeps its
// weight whatever the surrounding text runs at.
const wordmark = "font-sans font-medium";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    // One label on the wrapper: the text says "cl" and "cklog" and the ring
    // says nothing, so a reader walking the parts would announce a typo.
    <span role="img" aria-label="ClockLog" className={className}>
      <span aria-hidden className={`${wordmark} tracking-[-0.03em]`}>
        cl
      </span>
      {/* 0.58em against Geist's ~0.52em x-height, sat 0.03em below the
          baseline: the ring overshoots top and bottom exactly as a round
          letter does, so it reads as an "o" and not as a pasted-on icon. */}
      <LogoMark className="inline-block h-[0.58em] w-[0.58em] align-[-0.03em]" />
      <span aria-hidden className={`${wordmark} tracking-[-0.03em]`}>
        cklog
      </span>
    </span>
  );
}
