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

import { useEffect, useState } from "react";
import {
  fetchBlocks,
  fetchSummary,
  type BlockData,
  type TagSummary,
} from "@/lib/api/history";
import { fetchTags, type Tag } from "@/lib/api/tags";
import { localDayRange, formatClock, formatDuration, durationSeconds } from "@/lib/date/instant";
import BlockEditor from "./BlockEditor";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const stamp = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (isSameDay(date, today)) return `Today, ${stamp}`;
  if (isSameDay(date, yesterday)) return `Yesterday, ${stamp}`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

const KIND_LABEL: Record<BlockData["kind"], string> = {
  focus: "",
  short_break: "short break",
  long_break: "long break",
};

// A silent stretch shorter than this is just the turnaround between two
// blocks; longer than this, the day actually stopped and the list should
// say so instead of stacking two rows as if they were consecutive.
const GAP_THRESHOLD_SECONDS = 15 * 60;

// Render-time fallback: a block with no label but a tag shows the tag name.
// `label` stays null, so renaming the tag updates the display and the user
// can still overwrite the label independently.
export function focusName(label: string | null, tagName: string | undefined) {
  return label || tagName || "Unlabeled";
}

function blockStart(b: BlockData) {
  return b.intervals[0]?.started_at || b.started_at;
}

function blockEnd(b: BlockData): string | null {
  for (let i = b.intervals.length - 1; i >= 0; i--) {
    if (b.intervals[i].ended_at) return b.intervals[i].ended_at;
  }
  return null;
}

export default function HistoryPage() {
  const [date, setDate] = useState(() => new Date());
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [summary, setSummary] = useState<TagSummary[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { from, to } = localDayRange(date);
    let cancelled = false;
    Promise.all([fetchBlocks(from, to), fetchSummary(from, to)])
      .then(([b, s]) => {
        if (cancelled) return;
        setBlocks(b);
        setSummary(s);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reload]);

  function shiftDay(delta: number) {
    setLoading(true);
    setSelectedId(null);
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d);
  }

  function goToday() {
    setLoading(true);
    setSelectedId(null);
    setDate(new Date());
  }

  // Focus totals only — breaks appear in the list (SCR-20) but never in
  // the "Xh Ym focus" line.
  const focusBlocks = blocks.filter((b) => b.kind === "focus");
  const focusSeconds = focusBlocks.reduce((sum, b) => sum + durationSeconds(b.intervals), 0);
  const breakSeconds = blocks
    .filter((b) => b.kind !== "focus")
    .reduce((sum, b) => sum + durationSeconds(b.intervals), 0);

  // Widest share first: the bar and its legend read top-down as "where the
  // day actually went".
  const ranked = [...summary].sort((a, b) => b.total_seconds - a.total_seconds);
  const summaryTotal = ranked.reduce((sum, s) => sum + s.total_seconds, 0);

  // Map tag_id → Tag for dot color and name fallback; no new fetches needed.
  const tagById = new Map(tags.map((t) => [t.id, t]));

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const onToday = isSameDay(date, new Date());

  function afterEditorDone() {
    setSelectedId(null);
    setLoading(true);
    setReload((n) => n + 1);
  }

  return (
    <div className="max-w-md mx-auto py-6 px-4 md:max-w-4xl md:py-10">
      {/* Day navigation. Arrows are real 40px targets, not bare glyphs. */}
      <div className="flex items-center gap-2 mb-8">
        <button
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
          className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
        >
          ‹
        </button>
        <h2 className="flex-1 text-center text-base font-medium text-neutral-900">
          {formatLabel(date)}
        </h2>
        <button
          onClick={() => shiftDay(1)}
          aria-label="Next day"
          className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
        >
          ›
        </button>
      </div>

      {!onToday && (
        <div className="-mt-6 mb-6 text-center">
          <button
            onClick={goToday}
            className="text-xs text-neutral-500 hover:text-neutral-800 underline underline-offset-4"
          >
            Back to today
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500 text-center py-8">Loading...</div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 text-neutral-300">▤</div>
          <p className="text-sm text-neutral-600">No blocks yet</p>
          <p className="text-xs text-neutral-500 mt-1">
            Your finished blocks will show up here.
          </p>
        </div>
      ) : (
        <div className="md:flex md:gap-10 md:items-start">
          <div className="flex-1 min-w-0">
            {/* The day's headline number. It used to be the faintest text on
                the screen; it is the reason the screen exists. */}
            <p className="text-4xl font-semibold tabular-nums text-neutral-900 leading-none">
              {formatDuration(focusSeconds)}
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              focus across {focusBlocks.length} block{focusBlocks.length !== 1 ? "s" : ""}
              {breakSeconds > 0 && ` · ${formatDuration(breakSeconds)} break`}
            </p>

            {summaryTotal > 0 && (
              <>
                {/* Proportional bar: the split by tag, readable before any
                    number is. Tag color is the only saturated ink here. */}
                <div
                  className="mt-5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100"
                  role="img"
                  aria-label="Focus time by tag"
                >
                  {ranked.map((s) => (
                    <span
                      key={s.tag_id ?? "untagged"}
                      className={s.tag_color ? "" : "bg-neutral-300"}
                      style={{
                        width: `${(s.total_seconds / summaryTotal) * 100}%`,
                        ...(s.tag_color ? { backgroundColor: s.tag_color } : {}),
                      }}
                    />
                  ))}
                </div>

                <ul className="mt-4 space-y-2">
                  {ranked.map((s) => (
                    <li
                      key={s.tag_id ?? "untagged"}
                      className="flex items-center gap-2.5 text-sm text-neutral-800"
                    >
                      {/* Untagged falls back to the same neutral the block list
                          uses, so a tag's dot reads identically in both places. */}
                      <span
                        className="inline-block w-2.5 h-2.5 shrink-0 rounded-full bg-neutral-300"
                        style={s.tag_color ? { backgroundColor: s.tag_color } : undefined}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{s.tag_name}</span>
                      <span className="text-neutral-500 tabular-nums text-xs">
                        {Math.round((s.total_seconds / summaryTotal) * 100)}%
                      </span>
                      <span className="w-16 text-right text-neutral-700 tabular-nums">
                        {formatDuration(s.total_seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mt-9 mb-3 text-[10px] uppercase tracking-widest text-neutral-500">
              Timeline
            </h3>

            {/* Block list, hung off a continuous rail so the day reads as a
                sequence instead of a stack of similar rows. */}
            <ol className="relative">
              {blocks.map((b, i) => {
                const start = blockStart(b);
                const duration = durationSeconds(b.intervals);
                const isFocus = b.kind === "focus";
                const tag = isFocus && b.tag_id ? tagById.get(b.tag_id) : undefined;
                const dotColor = tag?.color;
                const name = isFocus ? focusName(b.label, tag?.name) : KIND_LABEL[b.kind];
                const isSelected = selectedId === b.id;

                const prevEnd = i > 0 ? blockEnd(blocks[i - 1]) : null;
                const gap = prevEnd
                  ? (new Date(start).getTime() - new Date(prevEnd).getTime()) / 1000
                  : 0;

                return (
                  <li key={b.id}>
                    {gap >= GAP_THRESHOLD_SECONDS && (
                      <div className="flex items-center gap-3 py-1 pl-14 text-[11px] text-neutral-400">
                        <span className="h-px flex-1 bg-neutral-200" />
                        <span className="tabular-nums">{formatDuration(gap)} away</span>
                        <span className="h-px flex-1 bg-neutral-200" />
                      </div>
                    )}
                    <button
                      onClick={() => setSelectedId(b.id)}
                      aria-label={`Edit block: ${name}`}
                      aria-current={isSelected || undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-xl py-2.5 pl-2 pr-3 text-left transition-colors ${
                        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
                      }`}
                    >
                      <span className="w-10 shrink-0 text-xs text-neutral-500 tabular-nums">
                        {formatClock(start)}
                      </span>

                      {/* Rail + node. Focus is a filled dot in the tag's color,
                          a break a hollow ring — SCR-20's ● / ○, drawn rather
                          than typed so it stops sharing the label's baseline. */}
                      <span className="relative flex w-3 shrink-0 justify-center self-stretch">
                        <span className="absolute inset-y-0 w-px bg-neutral-200" aria-hidden />
                        <span
                          className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            isFocus
                              ? "bg-neutral-700"
                              : "border border-neutral-300 bg-[var(--background)]"
                          }`}
                          style={
                            isFocus && dotColor ? { backgroundColor: dotColor } : undefined
                          }
                          aria-hidden
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate ${
                            isFocus
                              ? "text-[15px] text-neutral-900"
                              : "text-sm text-neutral-500"
                          }`}
                        >
                          {name}
                        </span>
                        {b.status === "aborted" && (
                          <span className="mt-1 inline-block rounded border border-neutral-300 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                            stopped early
                          </span>
                        )}
                      </span>

                      <span
                        className={`shrink-0 tabular-nums ${
                          isFocus ? "text-sm text-neutral-700" : "text-xs text-neutral-500"
                        }`}
                      >
                        {formatDuration(duration)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Desktop inspector (SCR-21 ## Desktop): edit without navigating away */}
          {selected && (
            <aside className="hidden md:block md:w-80 shrink-0 sticky top-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <BlockEditor
                key={selected.id}
                block={selected}
                tags={tags}
                onDone={afterEditorDone}
              />
            </aside>
          )}
        </div>
      )}

      {/* Mobile: the editor is a bottom sheet, same pattern as the plan's EntrySheet */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-20">
          <div
            className="absolute inset-0 bg-black/30"
            aria-hidden
            onClick={afterEditorDone}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <BlockEditor
              key={selected.id}
              block={selected}
              tags={tags}
              onDone={afterEditorDone}
            />
          </div>
        </div>
      )}
    </div>
  );
}
