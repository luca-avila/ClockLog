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

/**
 * SCR-40 "Data: Tags". Deleting a tag never deletes blocks or entries
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
      <ul className="space-y-2 mb-4">
        {tags.length === 0 && (
          <li className="text-sm text-neutral-400">No tags yet</li>
        )}
        {tags.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: t.color }}
              aria-hidden
            />
            {editingId === t.id ? (
              <>
                <input
                  aria-label="Tag name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 min-w-0 text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-0.5"
                />
                <input
                  aria-label="Tag color"
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-8 h-6 p-0 border-0 bg-transparent cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(t.id)}
                  className="text-xs text-neutral-500 hover:text-neutral-800"
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
            ) : confirmingId === t.id ? (
              <>
                <span className="flex-1 text-neutral-600">{t.name}</span>
                <span className="text-xs text-neutral-400">
                  Items keep their data, untagged
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="text-xs text-red-500 hover:text-red-600"
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
                <span className="flex-1 text-neutral-600">{t.name}</span>
                <button
                  type="button"
                  aria-label={`Edit tag ${t.name}`}
                  onClick={() => {
                    setEditingId(t.id);
                    setEditName(t.name);
                    setEditColor(t.color);
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
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
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <input
          aria-label="New tag name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag"
          className="flex-1 min-w-0 text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1"
        />
        <input
          aria-label="New tag color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-6 p-0 border-0 bg-transparent cursor-pointer"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Add
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500 mt-2">
          {error}
        </p>
      )}
      {notice && <p className="text-xs text-neutral-400 mt-2">{notice}</p>}
    </div>
  );
}
