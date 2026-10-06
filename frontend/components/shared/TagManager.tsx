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

import { useEffect, useState } from "react";
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  type Tag,
} from "@/lib/api/tags";

const TEXT_INPUT =
  "min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition-colors focus:border-neutral-500";

// The native color input is a grey box around a swatch in every browser;
// these strip it down to the swatch, round like the dots it produces.
const SWATCH_INPUT =
  "h-6 w-6 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-full border border-neutral-200 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0";

/**
 * SCR-40, the Tags card. Deleting a tag never deletes blocks or entries
 * (invariant 10) — they become untagged, and the delete response's
 * affected count is surfaced so that consequence is visible.
 */
export default function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6ee7b7");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#000000");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetchTags()
      .then(setTags)
      .catch(() => setError("Could not load tags"));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Give the tag a name");
      return;
    }
    setError(null);
    try {
      await createTag({ name: name.trim(), color });
      setName("");
      reload();
    } catch {
      setError("Could not create the tag — name already used?");
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) {
      setError("Give the tag a name");
      return;
    }
    setError(null);
    try {
      await updateTag(id, { name: editName.trim(), color: editColor });
      setEditingId(null);
      reload();
    } catch {
      setError("Could not save — name already used?");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const { affected } = await deleteTag(id);
      setNotice(
        affected > 0
          ? `Tag deleted — ${affected} ${affected === 1 ? "item" : "items"} became untagged`
          : "Tag deleted"
      );
      setConfirmingId(null);
      reload();
    } catch {
      setError("Could not delete the tag");
    }
  }

  return (
    <div>
      <ul className="divide-y divide-neutral-100">
        {tags.length === 0 && (
          <li className="py-3 text-sm text-neutral-400">No tags yet</li>
        )}
        {tags.map((t) => (
          <li key={t.id} className="flex min-h-12 items-center gap-3 py-2 text-sm">
            {editingId === t.id ? (
              <>
                <input
                  aria-label="Tag color"
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className={SWATCH_INPUT}
                />
                <input
                  aria-label="Tag name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(t.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className={`${TEXT_INPUT} h-8`}
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(t.id)}
                  className="text-xs font-medium text-neutral-700 hover:text-neutral-900"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-neutral-700">{t.name}</span>
                {confirmingId === t.id ? (
                  <>
                    <span className="hidden text-xs text-neutral-400 sm:inline">
                      Items keep their data, untagged
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="text-xs text-neutral-400 hover:text-neutral-600"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit tag ${t.name}`}
                      onClick={() => {
                        setEditingId(t.id);
                        setEditName(t.name);
                        setEditColor(t.color);
                      }}
                      className="text-xs text-neutral-400 hover:text-neutral-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete tag ${t.name}`}
                      onClick={() => setConfirmingId(t.id)}
                      className="text-xs text-neutral-400 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {/* A form, so Enter in the name field adds the tag. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        className="flex items-center gap-3 border-t border-neutral-100 py-3"
      >
        <input
          aria-label="New tag color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className={SWATCH_INPUT}
        />
        <input
          aria-label="New tag name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag"
          className={`${TEXT_INPUT} h-9`}
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-full border border-neutral-300 px-4 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
        >
          Add
        </button>
      </form>

      {error && (
        <p role="alert" className="pb-2 text-xs text-red-500">
          {error}
        </p>
      )}
      {notice && <p className="pb-2 text-xs text-neutral-400">{notice}</p>}
    </div>
  );
}
