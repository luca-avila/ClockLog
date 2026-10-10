// ClockLog — a timer and weekly planner
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

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import TagPicker from "@/components/shared/TagPicker";
import PrimaryButton from "@/components/shared/PrimaryButton";
import Sheet from "@/components/shared/Sheet";
import { createEntry, deleteEntry, updateEntry, type EntryCreate } from "@/lib/api/plan";
import { entryKeys, entryQuery } from "@/lib/queries/plan";
import { tagsQuery } from "@/lib/queries/tags";
import type { EntrySheetMode } from "@/lib/plan/view";
import { hhmm } from "@/lib/date/week";
import type { PlanLink } from "@/lib/plan/urls";

export default function EntrySheet({
  mode,
  returnTo,
}: {
  mode: EntrySheetMode;
  returnTo: PlanLink;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tags = useQuery(tagsQuery()).data ?? [];
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
  const [error, setError] = useState<string | null>(null);

  const editId = mode.kind === "edit" ? mode.entryId : null;
  // The stored row is the truth — an occurrence only identifies it.
  const entry = useQuery({ ...entryQuery(editId ?? ""), enabled: editId !== null });
  const editing = editId !== null ? (entry.data ?? null) : null;

  // Copy the stored row into the form once it arrives: the fields are the
  // user's to edit from then on, so this runs per loaded row, not per render.
  useEffect(() => {
    if (!editing) return;
    /* eslint-disable react-hooks/set-state-in-effect -- seeding a form from a fetched row */
    setName(editing.name);
    setDate(editing.date);
    setAllDay(editing.all_day);
    setStart(editing.start_time ? hhmm(editing.start_time) : "");
    setEnd(editing.end_time ? hhmm(editing.end_time) : "");
    setTagId(editing.tag_id);
    setRepeatWeekly(editing.repeat_weekly);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [editing]);

  const loadError = entry.isError ? "Could not load the entry" : null;

  // Save/delete invalidate every cached range, so the screen behind refetches
  // whatever it shows; cancel below navigates back and invalidates nothing.
  function closeChanged() {
    void queryClient.invalidateQueries({ queryKey: entryKeys.all });
    void navigate({ ...returnTo, replace: true });
  }

  const save = useMutation({
    mutationFn: (payload: EntryCreate) =>
      editing ? updateEntry(editing.id, payload) : createEntry(payload),
    onSuccess: closeChanged,
    onError: () => setError("Could not save — try again"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: closeChanged,
    onError: () => setError("Could not delete — try again"),
  });

  const busy = save.isPending || remove.isPending;

  // Wall-clock note, not an error: the server accepts midnight spans (S-19).
  const spansMidnight = !allDay && start !== "" && end !== "" && end <= start;

  function handleSave() {
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
    setError(null);
    save.mutate({
      name: name.trim(),
      date,
      all_day: allDay,
      start_time: allDay ? null : start,
      end_time: allDay ? null : end,
      tag_id: tagId,
      repeat_weekly: repeatWeekly,
    });
  }

  // The sheet had no way out but Save or Delete — leaving it needed the
  // browser's back button. Cancel invalidates nothing: nothing changed, so
  // the screen behind has nothing to refetch.
  function handleClose() {
    void navigate({ ...returnTo, replace: true });
  }

  function handleDelete() {
    if (!editing || busy) return;
    remove.mutate(editing.id);
  }

  const LABEL =
    "mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400";
  const FIELD =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-500";

  return (
    <Sheet onClose={handleClose}>
      <div className="p-5 md:p-6">
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

        {(error ?? loadError) && (
          <p role="alert" className="mt-4 text-xs text-red-500">
            {error ?? loadError}
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
    </Sheet>
  );
}
