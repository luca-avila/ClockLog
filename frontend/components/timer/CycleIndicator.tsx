"use client";

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
    <div className="flex gap-1.5 justify-center" aria-label={`Cycle: ${completed} of ${total} completed`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block w-2 h-2 rounded-full transition-colors ${
            i < completed && !isBreak
              ? "bg-neutral-900"
              : isBreak
                ? "bg-emerald-500"
                : "bg-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}
