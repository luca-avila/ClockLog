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

import { useState } from "react";
import TagPicker from "@/components/shared/TagPicker";
import { type BlockData, updateBlock, deleteBlock } from "@/lib/api/history";
import type { Tag } from "@/lib/api/tags";

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** Combine the block's local calendar day with an edited HH:MM. */
function sameLocalDay(iso: string, hhmm: string): string {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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
  const interval = block.intervals[0];
  const originalStartIso = interval?.started_at ?? block.started_at;
  const originalEndIso = interval?.ended_at ?? null;

  const [label, setLabel] = useState(block.label ?? "");
  const [tagId, setTagId] = useState<string | null>(block.tag_id);
  const [status, setStatus] = useState<BlockData["status"]>(block.status);
  const [start, setStart] = useState(() => toTimeInput(originalStartIso));
  const [end, setEnd] = useState(() =>
    originalEndIso ? toTimeInput(originalEndIso) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const durationSeconds = block.intervals.reduce((sum, iv) => {
    if (iv.ended_at) {
      return (
        sum +
        (new Date(iv.ended_at).getTime() - new Date(iv.started_at).getTime()) / 1000
      );
    }
    return sum;
  }, 0);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      label: label.trim() || null,
      tag_id: tagId,
      status,
    };
    // Send times only when touched: a block that spans midnight stores an
    // end on the next local day, which an untouched time input would
    // otherwise flatten back onto the start's day.
    const startDirty = start !== toTimeInput(originalStartIso);
    const endDirty = originalEndIso !== null && end !== toTimeInput(originalEndIso);
    if (startDirty) payload.started_at = sameLocalDay(originalStartIso, start);
    if (endDirty) payload.ended_at = sameLocalDay(originalEndIso, end);
    if (startDirty || endDirty) {
      const newStart = new Date(
        (payload.started_at as string | undefined) ?? originalStartIso
      );
      const newEnd = new Date((payload.ended_at as string | undefined) ?? originalEndIso ?? "");
      if (originalEndIso && newEnd <= newStart) {
        setError("End must be after start");
        setBusy(false);
        return;
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
    <div className="p-5">
      <h2 className="text-sm font-medium text-neutral-700 mb-4">Edit block</h2>

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
        onChange={(e) => setLabel(e.target.value)}
        className="w-full text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none pb-1 mb-4"
      />

      <div className="flex gap-3 mb-3">
        <div>
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
        <div>
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
        <div>
          <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1">
            Duration
          </span>
          <span className="text-sm text-neutral-400 tabular-nums pb-1 block">
            {formatDuration(durationSeconds)}
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
        <button
          type="button"
          aria-label="SAVE"
          onClick={handleSave}
          disabled={busy}
          className="px-10 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50"
        >
          SAVE
        </button>
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
