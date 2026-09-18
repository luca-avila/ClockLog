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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchBlocks,
  fetchSummary,
  type BlockData,
  type TagSummary,
} from "@/lib/api/history";
import { fetchTags, type Tag } from "@/lib/api/tags";
import {
  localDayRange,
  localWeekRange,
  localMonthRange,
  startOfLocalDay,
  formatWeekSubtitle,
  formatMonthSubtitle,
  formatClock,
  formatDuration,
  durationSeconds,
} from "@/lib/date/instant";
import { blockStart, groupByLocalDay, localDayKey } from "@/lib/timer/history-group";
import Sheet from "@/components/shared/Sheet";
import BlockEditor from "./BlockEditor";

function formatDayHeading(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function formatDayNumber(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
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

// SCR-20 shows one range at a time; Day stays the default so the screen a
// phone lands on is unchanged.
type HistoryView = "day" | "week" | "month";

const HISTORY_VIEWS: readonly HistoryView[] = ["day", "week", "month"];

const HISTORY_VIEW_LABEL: Record<HistoryView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

const EMPTY_TITLE: Record<HistoryView, string> = {
  day: "No blocks yet",
  week: "No blocks this week",
  month: "No blocks this month",
};

// The jump-back button follows the active view: "Today" would lie in
// Week/Month, where the range — not the day — is what returns to now.
const CURRENT_LABEL: Record<HistoryView, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

function rangeFor(view: HistoryView, anchor: Date): { from: string; to: string } {
  if (view === "week") return localWeekRange(anchor);
  if (view === "month") return localMonthRange(anchor);
  return localDayRange(anchor);
}

/** One slot per local day of the active range, zeros included. */
interface DayBucket {
  date: Date;
  key: string;
  focusSeconds: number;
}

/** Local days in [from, to), in order. Day-stepping goes through the Date
 *  constructor so DST-shortened days still land on the next local midnight. */
function daysInRange(from: string, to: string): Date[] {
  const days: Date[] = [];
  const end = new Date(to).getTime();
  let cursor = startOfLocalDay(new Date(from));
  while (cursor.getTime() < end) {
    days.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return days;
}

/** Focus seconds per local day, one slot per entry in `days`. Focus-only and
 *  keyed by the local day a block *started*, identical to the day headings
 *  (invariants 5 and 7). */
export function bucketDayFocus(blocks: BlockData[], days: readonly Date[]): number[] {
  const index = new Map(days.map((d, i) => [localDayKey(d.toISOString()), i]));
  const totals = days.map(() => 0);
  for (const block of blocks) {
    if (block.kind !== "focus") continue;
    const slot = index.get(localDayKey(blockStart(block)));
    if (slot === undefined) continue;
    totals[slot] += durationSeconds(block.intervals);
  }
  return totals;
}

function formatBarDay(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Inverse of `localDayKey` for a heading click: same local calendar day. */
function dayFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Render-time fallback: a block with no label but a tag shows the tag name.
// `label` stays null, so renaming the tag updates the display and the user
// can still overwrite the label independently.
export function focusName(label: string | null, tagName: string | undefined) {
  return label || tagName || "Unlabeled";
}

function blockEnd(b: BlockData): string {
  return b.intervals[b.intervals.length - 1].ended_at;
}

export default function HistoryPage() {
  const [view, setView] = useState<HistoryView>("day");
  // The anchor keeps its position inside the active view: the day within
  // the shown week/month, so switching tabs never jumps elsewhere.
  const [anchor, setAnchor] = useState<Date>(() => startOfLocalDay(new Date()));
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
    const { from, to } = rangeFor(view, anchor);
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
  }, [anchor, view, reload]);

  // One unit of the active view per click. The month case keeps the day of
  // month and lets Date roll over (Jan 31 + 1 month → Mar 3): the range is
  // the month of the resulting anchor, never the day.
  function shift(delta: number) {
    setLoading(true);
    setSelectedId(null);
    setAnchor((prev) => {
      if (view === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() + delta, prev.getDate());
      }
      const days = view === "week" ? delta * 7 : delta;
      return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + days);
    });
  }

  function changeView(next: HistoryView) {
    if (next === view) return;
    setLoading(true);
    setSelectedId(null);
    setView(next);
  }

  function goToday() {
    setLoading(true);
    setSelectedId(null);
    setAnchor(startOfLocalDay(new Date()));
  }

  // Drill-down is a state change, not navigation: Day becomes the view and
  // the clicked date its anchor, so the same screen (and inspector) stays put.
  function handleDrillDown(day: Date) {
    setLoading(true);
    setSelectedId(null);
    setView("day");
    setAnchor(startOfLocalDay(day));
  }

  // Focus totals only — breaks appear in the list (SCR-20) but never in
  // the "Xh Ym focus" line.
  const focusBlocks = blocks.filter((b) => b.kind === "focus");
  const focusSeconds = focusBlocks.reduce((sum, b) => sum + durationSeconds(b.intervals), 0);
  const abortedCount = blocks.filter((b) => b.status === "aborted").length;
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
  const groups = groupByLocalDay(blocks);
  const dayBuckets: DayBucket[] = useMemo(() => {
    const { from, to } = rangeFor(view, anchor);
    const days = daysInRange(from, to);
    const totals = bucketDayFocus(blocks, days);
    return days.map((date, i) => ({
      date,
      key: localDayKey(date.toISOString()),
      focusSeconds: totals[i],
    }));
  }, [blocks, view, anchor]);
  const maxFocus = Math.max(0, ...dayBuckets.map((b) => b.focusSeconds));
  const onToday = rangeFor(view, anchor).from === rangeFor(view, new Date()).from;

  const subtitle: ReactNode =
    view === "day" ? (
      <>
        {formatDayHeading(anchor)} <span className="text-neutral-300">/</span>{" "}
        {formatDayNumber(anchor)}
      </>
    ) : view === "week" ? (
      formatWeekSubtitle(anchor)
    ) : (
      formatMonthSubtitle(anchor)
    );

  function afterEditorDone() {
    setSelectedId(null);
    setLoading(true);
    setReload((n) => n + 1);
  }

  // One row, shared by every view: the same rail, dot, clock, duration and
  // "stopped early" badge. `prev` is the previous row *of the same local
  // day*, so a gap never spans a day boundary (decided 4).
  function renderRow(b: BlockData, prev: BlockData | null) {
    const start = blockStart(b);
    const duration = durationSeconds(b.intervals);
    const isFocus = b.kind === "focus";
    const tag = isFocus && b.tag_id ? tagById.get(b.tag_id) : undefined;
    const dotColor = tag?.color;
    const name = isFocus ? focusName(b.label, tag?.name) : KIND_LABEL[b.kind];
    const isSelected = selectedId === b.id;

    const prevEnd = prev ? blockEnd(prev) : null;
    const gap = prevEnd ? (new Date(start).getTime() - new Date(prevEnd).getTime()) / 1000 : 0;

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
          aria-pressed={isSelected}
          className={`group relative flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors sm:p-3.5 ${
            isSelected
              ? "border-neutral-400 bg-neutral-100"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
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
                isFocus ? "bg-neutral-700" : "border border-neutral-300 bg-[var(--background)]"
              }`}
              style={isFocus && dotColor ? { backgroundColor: dotColor } : undefined}
              aria-hidden
            />
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={`block truncate ${
                isFocus ? "text-[15px] text-neutral-900" : "text-sm text-neutral-500"
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
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            Time recorded
          </p>
          <h1 className="text-3xl font-light tracking-tight text-neutral-800 sm:text-4xl">History</h1>
          <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>
          {/* Segmented control, not PrimaryButton: switching views is
              navigation, and PrimaryButton is reserved for actions that
              commit something. */}
          <div className="mt-4 inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-1">
            {HISTORY_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {HISTORY_VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => shift(-1)}
            aria-label={`Previous ${view}`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-200 text-lg text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
          >
            <span aria-hidden>&lsaquo;</span>
          </button>
          {!onToday && (
            <button
              onClick={goToday}
              className="h-10 rounded-full border border-neutral-200 px-4 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
            >
              {CURRENT_LABEL[view]}
            </button>
          )}
          <button
            onClick={() => shift(1)}
            aria-label={`Next ${view}`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-200 text-lg text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
          >
            <span aria-hidden>&rsaquo;</span>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4" aria-label="Loading history">
          <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-20 text-center">
          <p className="text-sm font-medium text-neutral-600">{EMPTY_TITLE[view]}</p>
          <p className="mt-2 text-sm text-neutral-400">Your finished blocks will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex-1 min-w-0">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6" aria-labelledby="focus-time-heading">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p id="focus-time-heading" className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Focus time
                  </p>
                  <p className="mt-2 text-4xl font-light leading-none tabular-nums text-neutral-900">
                    {formatDuration(focusSeconds)}
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    {focusBlocks.length} block{focusBlocks.length !== 1 ? "s" : ""}
                    {breakSeconds > 0 && ` · ${formatDuration(breakSeconds)} break`}
                  </p>
                </div>
                <dl className="flex gap-5 text-right">
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-neutral-400">Entries</dt>
                    <dd className="mt-1 text-lg tabular-nums text-neutral-700">{blocks.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-neutral-400">Stopped early</dt>
                    <dd className="mt-1 text-lg tabular-nums text-neutral-700">{abortedCount}</dd>
                  </div>
                </dl>
              </div>

              {/* Daily focus totals above the tag split: one bar per local
                  day of the range, zeros included, clickable to drill into
                  that day. Neutral ink only — tag color stays in the
                  breakdown below. */}
              {view !== "day" && !loading && blocks.length > 0 && (
                <section
                  aria-label="Daily totals"
                  className={`mt-6 flex h-24 items-end ${
                    view === "month" ? "gap-0.5" : "gap-1"
                  }`}
                >
                  {dayBuckets.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => handleDrillDown(b.date)}
                      aria-label={`Show ${formatBarDay(b.date)} — ${formatDuration(
                        b.focusSeconds
                      )}`}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    >
                      <div className="flex h-full w-full items-end bg-neutral-200">
                        <div
                          className="w-full bg-neutral-700"
                          style={{
                            height:
                              b.focusSeconds === 0
                                ? "4px"
                                : `${Math.max(8, (b.focusSeconds / maxFocus) * 100)}%`,
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {summaryTotal > 0 && (
                <>
                  {/* Proportional bar: the split by tag, readable before any
                      number is. Tag color is the only saturated ink here. */}
                  <div
                    className="mt-6 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100"
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
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-300"
                          style={s.tag_color ? { backgroundColor: s.tag_color } : undefined}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{s.tag_name}</span>
                        <span className="text-xs tabular-nums text-neutral-500">
                          {Math.round((s.total_seconds / summaryTotal) * 100)}%
                        </span>
                        <span className="w-16 text-right tabular-nums text-neutral-700">
                          {formatDuration(s.total_seconds)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <div className="mt-8 mb-3 flex items-baseline justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-neutral-700">Timeline</h3>
                <p className="mt-1 text-xs text-neutral-400">Select a block to inspect or edit it.</p>
              </div>
              <span className="text-xs tabular-nums text-neutral-400">{blocks.length} entries</span>
            </div>

            {/* Block list, hung off a continuous rail so a day reads as a
                sequence instead of a stack of similar rows. Day keeps the
                flat list it has always had; the wider views add one heading
                per local day (invariant 7). */}
            {view === "day" ? (
              <ol className="relative space-y-2">
                {blocks.map((b, i) => renderRow(b, i > 0 ? blocks[i - 1] : null))}
              </ol>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <h4 className="mb-2 text-xs font-medium text-neutral-500">
                      {/* Second drill-down affordance: the heading keeps its
                          markup but the text becomes the button. */}
                      <button
                        type="button"
                        onClick={() => handleDrillDown(dayFromKey(g.key))}
                        aria-label={`Show ${formatBarDay(dayFromKey(g.key))} — ${formatDuration(
                          g.focusSeconds
                        )}`}
                        className="text-left transition-colors hover:text-neutral-800"
                      >
                        {g.label}{" "}
                        <span className="text-neutral-400">— {formatDuration(g.focusSeconds)}</span>
                      </button>
                    </h4>
                    <ol className="relative space-y-2">
                      {g.items.map((b, i) => renderRow(b, i > 0 ? g.items[i - 1] : null))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Desktop inspector (SCR-21): edit without navigating away. */}
          <aside className="hidden lg:sticky lg:top-6 lg:block">
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {selected ? (
                <BlockEditor
                  key={selected.id}
                  block={selected}
                  tags={tags}
                  onDone={afterEditorDone}
                />
              ) : (
                <div className="px-5 py-8">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Inspector</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-500">Select a block to see its details and make an edit.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Mobile: the editor is a bottom sheet, desktop keeps the two-pane layout. */}
      {selected && (
        <div className="md:hidden">
          <Sheet onClose={afterEditorDone}>
            <BlockEditor
              key={selected.id}
              block={selected}
              tags={tags}
              onDone={afterEditorDone}
            />
          </Sheet>
        </div>
      )}
    </div>
  );
}
