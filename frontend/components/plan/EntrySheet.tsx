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

  // The sheet had no way out but Save or Delete — leaving it needed the
  // browser's back button. Cancel returns without a tick: nothing changed,
  // so the screen behind has nothing to refetch.
  function handleClose() {
    router.replace(returnTo);
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

  const LABEL =
    "mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400";
  const FIELD =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-500";

  return (
    <div className="fixed inset-x-0 bottom-16 top-0 z-30 md:bottom-0">
      <div
        className="absolute inset-0 bg-black/30"
        aria-hidden
        onClick={handleClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:inset-0 md:m-auto md:h-fit md:max-w-md md:rounded-2xl md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
              Plan
            </p>
            <h2 className="text-xl font-light tracking-tight text-neutral-800">
              {editing ? "Edit entry" : "New entry"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <label htmlFor="entry-name" className={`${LABEL} grid`}>
          Name
        </label>
        <input
          id="entry-name"
          aria-label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${FIELD} mb-4`}
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <label htmlFor="entry-day" className={`${LABEL} grid`}>
              Day
            </label>
            <input
              id="entry-day"
              aria-label="Day"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </div>
          {!allDay && (
            <>
              <div>
                <label htmlFor="entry-from" className={`${LABEL} grid`}>
                  From
                </label>
                <input
                  id="entry-from"
                  aria-label="From"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={`${FIELD} tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="entry-to" className={`${LABEL} grid`}>
                  To
                </label>
                <input
                  id="entry-to"
                  aria-label="To"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={`${FIELD} tabular-nums`}
                />
              </div>
            </>
          )}
        </div>

        {spansMidnight && (
          <p className="mb-3 text-xs text-neutral-400">
            Ends after midnight — the entry stays on its day.
          </p>
        )}

        {/* The two flags read as one pair of rows, so neither hides under a
            field it does not belong to. */}
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm text-neutral-700">
            <input
              type="checkbox"
              aria-label="All day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm text-neutral-700">
            <input
              type="checkbox"
              aria-label="Repeat weekly"
              checked={repeatWeekly}
              onChange={(e) => setRepeatWeekly(e.target.checked)}
            />
            Repeat weekly
          </label>
        </div>

        <div className="mt-5">
          <p className={LABEL}>Tag</p>
          <TagPicker tags={tags} value={tagId} onChange={setTagId} />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-4">
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
              className="ml-auto text-xs text-neutral-400 transition-colors hover:text-red-500"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
