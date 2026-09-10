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

import { useState } from "react";
import TagPicker from "@/components/shared/TagPicker";
import PrimaryButton from "@/components/shared/PrimaryButton";
import {
  type BlockData,
  type BlockPatch,
  updateBlock,
  deleteBlock,
} from "@/lib/api/history";
import type { Tag } from "@/lib/api/tags";
import { formatClock, withLocalTime, formatDuration, durationSeconds } from "@/lib/date/instant";

export interface BlockEditorProps {
  block: BlockData;
  tags: Tag[];
  onDone: () => void;
}

/**
 * SCR-21 block editor: label, tag, start/end, status, duration (derived),
 * SAVE and Delete. Times are edited on the block's own local day; a
 * midnight-spanning block keeps its stored times unless actually changed.
 */
export default function BlockEditor({ block, tags, onDone }: BlockEditorProps) {
  // Envelope edit (SCR-21): the block starts at its first segment and ends
  // at its last one. The pause gaps in between are never edited here.
  const first = block.intervals[0];
  const last = block.intervals[block.intervals.length - 1] ?? first;
  const originalStartIso = first?.started_at ?? block.started_at;
  const originalEndIso = last?.ended_at ?? null;

  const [label, setLabel] = useState(block.label ?? "");
  const [tagId, setTagId] = useState<string | null>(block.tag_id);
  const [status, setStatus] = useState<BlockData["status"]>(block.status);
  const [start, setStart] = useState(() => formatClock(originalStartIso));
  const [end, setEnd] = useState(() =>
    originalEndIso ? formatClock(originalEndIso) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const payload: BlockPatch = {
      label: label.trim() || null,
      tag_id: tagId,
      status,
    };
    // Send times only when touched: a block that spans midnight stores an
    // end on the next local day, which an untouched time input would
    // otherwise flatten back onto the start's day.
    const startDirty = start !== formatClock(originalStartIso);
    if (startDirty) payload.started_at = withLocalTime(originalStartIso, start);
    if (originalEndIso !== null) {
      const endDirty = end !== formatClock(originalEndIso);
      if (endDirty) payload.ended_at = withLocalTime(originalEndIso, end);
      if (startDirty || endDirty) {
        const newStart = new Date(payload.started_at ?? originalStartIso);
        const newEnd = new Date(payload.ended_at ?? originalEndIso);
        if (newEnd <= newStart) {
          setError("End must be after start");
          setBusy(false);
          return;
        }
      }
    }

    try {
      await updateBlock(block.id, payload);
      onDone();
    } catch {
      setError("Could not save — try again");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBlock(block.id);
      onDone();
    } catch {
      setError("Could not delete — try again");
      setBusy(false);
    }
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
            Inspector
          </p>
          <h2 className="mt-1 text-lg font-medium text-neutral-800">Edit block</h2>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close editor"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <span aria-hidden>&times;</span>
        </button>
      </div>

      <label
        htmlFor="block-label"
        className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
      >
        Label
      </label>
      <input
        id="block-label"
        type="text"
        value={label}
        placeholder={tagId ? tags.find((t) => t.id === tagId)?.name ?? "" : ""}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 mb-4"
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="min-w-0">
          <label
            htmlFor="block-start"
            className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
          >
            Started
          </label>
          <input
            id="block-start"
            aria-label="Started"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 bg-transparent"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="block-end"
            className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1"
          >
            Ended
          </label>
          <input
            id="block-end"
            aria-label="Ended"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 bg-transparent"
          />
        </div>
        <div className="col-span-2 rounded-lg bg-neutral-50 px-3 py-2 sm:col-span-1">
          <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1">
            Duration
          </span>
          <span className="text-sm text-neutral-600 tabular-nums pb-1 block">
            {formatDuration(durationSeconds(block.intervals))}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1">
          Status
        </span>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as BlockData["status"])}
          className="text-sm text-neutral-600 border rounded px-2 py-1 bg-transparent"
        >
          <option value="completed">Completed</option>
          <option value="aborted">Aborted</option>
        </select>
      </div>

      <div>
        <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
          Tag
        </span>
        <TagPicker tags={tags} value={tagId} onChange={setTagId} />
      </div>

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
        <button
          type="button"
          aria-label="Delete block"
          onClick={handleDelete}
          disabled={busy}
          className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
        >
          Delete block
        </button>
      </div>
    </div>
  );
}
