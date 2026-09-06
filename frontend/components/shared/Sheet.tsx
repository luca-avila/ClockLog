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

"use client";

import type { ReactNode } from "react";

interface SheetProps {
  children: ReactNode;
  onClose: () => void;
}

/**
 * Bottom sheet on mobile, centered dialog from md:. The AGENTS.md overlay
 * rules live here, once: the 56px tab-bar clearance (`bottom-16` below the
 * bar on mobile, the full band from md:) and the z-index. z-50 beats Toast
 * (z-40) and the tab bar (z-10), so a toast never paints over a sheet's
 * lower edge. It takes children instead of content because shared/ cannot
 * import a feature module (invariant 11) — the caller brings its own.
 */
export default function Sheet({ children, onClose }: SheetProps) {
  return (
    <div className="fixed inset-x-0 bottom-16 top-0 z-50 md:bottom-0">
      <div className="absolute inset-0 bg-black/30" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-2xl bg-white shadow-xl md:inset-0 md:m-auto md:h-fit md:max-w-md md:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}
