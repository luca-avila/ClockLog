"use client";

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

interface CycleIndicatorProps {
  completed: number;
  total: number;
  isBreak: boolean;
}

export default function CycleIndicator({
  completed,
  total,
  isBreak,
}: CycleIndicatorProps) {
  return (
    // role="img" because ARIA drops a name on a generic role; the dots are one
    // graphic, not a group of separate items (cf. TagPicker's role="group").
    <div
      className="flex gap-1.5 justify-center"
      role="img"
      aria-label={`Cycle: ${completed} of ${total} completed`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block h-2 w-2 rounded-full transition-colors ${
            i < completed
              ? // Dimmed during a break: the row reads "resting", without
                // spending a saturated color that belongs to tags.
                isBreak
                ? "bg-neutral-400"
                : "bg-neutral-900"
              : "bg-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}
