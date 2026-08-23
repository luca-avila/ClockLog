// Tempo — a timer and weekly planner
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

// Header omits the word this module may never contain (invariant 13).

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TagPicker from "@/components/shared/TagPicker";
import PrimaryButton from "@/components/shared/PrimaryButton";
import {
  createEntry,
  deleteEntry,
  fetchEntry,
  updateEntry,
  type Entry,
} from "@/lib/api/plan";
import { fetchTags, type Tag } from "@/lib/api/tags";
import type { EntrySheetMode } from "@/lib/plan/view";
import { hhmm } from "@/lib/date/week";

export default function EntrySheet({
  mode,
  returnTo,
}: {
  mode: EntrySheetMode;
  returnTo: string;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState(mode.kind === "create" ? mode.date : "");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(
    mode.kind === "create" && mode.hour != null
      ? `${String(mode.hour).padStart(2, "0")}:00`
      : ""
  );
  const [end, setEnd] = useState(
    mode.kind === "create" && mode.hour != null
      ? `${String(mode.hour + 1).padStart(2, "0")}:00`
      : ""
  );
  const [tagId, setTagId] = useState<string | null>(null);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editId = mode.kind === "edit" ? mode.entryId : null;

  useEffect(() => {
    let cancelled = false;
    fetchTags()
      .then((t) => {
        if (!cancelled) setTags(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editId === null) return;
    let cancelled = false;
    // The stored row is the truth — an occurrence only identifies it.
    fetchEntry(editId)
      .then((e) => {
        if (cancelled) return;
        setEditing(e);
        setName(e.name);
        setDate(e.date);
        setAllDay(e.all_day);
        setStart(e.start_time ? hhmm(e.start_time) : "");
        setEnd(e.end_time ? hhmm(e.end_time) : "");
        setTagId(e.tag_id);
        setRepeatWeekly(e.repeat_weekly);
      })
      .catch(() => setError("Could not load the entry"));
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // Wall-clock note, not an error: the server accepts midnight spans (S-19).
  const spansMidnight = !allDay && start !== "" && end !== "" && end <= start;

  // The tick makes the screen behind refetch after a save.
  function closeOver(returnTo: string): string {
    return `${returnTo}${returnTo.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the entry a name");
      return;
    }
    if (!date) {
      setError("Pick a day");
      return;
    }
    if (!allDay && (start === "" || end === "")) {
      setError("Set from and to, or check All day");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      date,
      all_day: allDay,
      start_time: allDay ? null : start,
      end_time: allDay ? null : end,
      tag_id: tagId,
      repeat_weekly: repeatWeekly,
    };
    try {
      if (editing) await updateEntry(editing.id, payload);
      else await createEntry(payload);
      router.replace(closeOver(returnTo));
    } catch {
      setError("Could not save — try again");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await deleteEntry(editing.id);
      router.replace(closeOver(returnTo));
    } catch {
      setError("Could not delete — try again");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20">
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-md bg-white rounded-t-2xl md:rounded-2xl p-5 shadow-xl">
        <h2 className="text-sm font-medium text-neutral-700 mb-4">
          {editing ? "Edit entry" : "New entry"}
        </h2>

        <label
          htmlFor="entry-name"
          className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
        >
          Name
        </label>
        <input
          id="entry-name"
          aria-label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 mb-4"
        />

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label
              htmlFor="entry-day"
              className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
            >
              Day
            </label>
            <input
              id="entry-day"
              aria-label="Day"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 bg-transparent"
            />
          </div>
          {!allDay && (
            <>
              <div>
                <label
                  htmlFor="entry-from"
                  className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
                >
                  From
                </label>
                <input
                  id="entry-from"
                  aria-label="From"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 bg-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="entry-to"
                  className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
                >
                  To
                </label>
                <input
                  id="entry-to"
                  aria-label="To"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 bg-transparent"
                />
              </div>
            </>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-600 mb-1">
          <input
            type="checkbox"
            aria-label="All day"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All day
        </label>
        {spansMidnight && (
          <p className="text-xs text-neutral-400">
            Ends after midnight — the entry stays on its day.
          </p>
        )}

        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
            Tag
          </p>
          <TagPicker tags={tags} value={tagId} onChange={setTagId} />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-600 mt-4">
          <input
            type="checkbox"
            aria-label="Repeat weekly"
            checked={repeatWeekly}
            onChange={(e) => setRepeatWeekly(e.target.checked)}
          />
          Repeat weekly
        </label>

        {error && (
          <p role="alert" className="text-xs text-red-500 mt-3">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4 mt-6">
          <PrimaryButton
            type="button"
            aria-label="SAVE"
            onClick={handleSave}
            disabled={busy}
          >
            SAVE
          </PrimaryButton>
          {editing && (
            <button
              type="button"
              aria-label="Delete"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
