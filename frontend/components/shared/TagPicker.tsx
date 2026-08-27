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

"use client";

import type { Tag } from "@/lib/api/tags";

export interface TagPickerProps {
  tags: Tag[];
  value: string | null;
  onChange: (tagId: string | null) => void;
}

/**
 * Chip picker shared by both modules (G-4: shared tags). Tag colors are
 * the only saturated color in the UI — they come from the data.
 */
export default function TagPicker({ tags, value, onChange }: TagPickerProps) {
  if (tags.length === 0) {
    return <p className="text-xs text-neutral-300">No tags yet</p>;
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tag">
      {tags.map((t) => {
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
              selected
                ? "border-neutral-700 text-neutral-900"
                : "border-neutral-200 text-neutral-400 hover:border-neutral-300"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: t.color }}
              aria-hidden
            />
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
