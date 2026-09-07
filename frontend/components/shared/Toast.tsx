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

import type { ReactNode } from "react";

interface ToastProps {
  slot: "app" | "page";
  children: ReactNode;
}

/**
 * The two message slots of AGENTS.md, as position only. `app` is the
 * centered slot (app-wide messages, QueueSync); `page` the right-hand one
 * (page-scoped messages, /settings). At most one page-scoped message shows
 * per screen. Clearance over the 56px tab bar lives here too (`bottom-16`
 * mobile, `md:bottom-4` once the bar is gone) — above the bar (z-10), below
 * an open Sheet (z-40 vs z-50). Tone, `role`, and text are the caller's.
 */
export default function Toast({ slot, children }: ToastProps) {
  const position = slot === "app" ? "left-1/2 -translate-x-1/2" : "right-4";
  return (
    <div className={`fixed bottom-16 md:bottom-4 z-40 ${position}`}>{children}</div>
  );
}
