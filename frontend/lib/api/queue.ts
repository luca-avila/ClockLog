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

import { apiFetch, ApiError, isSignedIn } from "./client";

export interface BlockIntervalPayload {
  started_at: string;
  ended_at: string;
}

export interface BlockPayload {
  id: string;
  status: "completed" | "aborted";
  kind: "focus" | "short_break" | "long_break";
  label: string | null;
  tag_id: string | null;
  // A finished block always carries at least one closed interval. There is
  // deliberately no envelope fallback: the pre-interval wire shape must be
  // dropped, not re-sent (no migration, single-user pre-launch).
  intervals: BlockIntervalPayload[];
}

const QUEUE_KEY = "clocklog_block_queue";
const RETRY_MS = 30_000;

function isIntervalPayload(v: unknown): v is BlockIntervalPayload {
  if (typeof v !== "object" || v === null) return false;
  const iv = v as Record<string, unknown>;
  if (typeof iv.started_at !== "string" || typeof iv.ended_at !== "string") return false;
  const start = Date.parse(iv.started_at);
  const end = Date.parse(iv.ended_at);
  // Closed and ordered; a stale envelope-shaped entry never passes. One notch
  // looser than the server's strict `end > start`: a zero-length tail can only
  // come from resume+stop in the same millisecond, and letting it reach the
  // server turns that into a *visible* drop (flushQueue counts it and fires
  // onBlocksDropped) instead of the silent filtering readQueue does for
  // malformed and legacy shapes (invariant 9).
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

function isBlockPayload(v: unknown): v is BlockPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" && p.id.length > 0 &&
    (p.status === "completed" || p.status === "aborted") &&
    (p.kind === "focus" || p.kind === "short_break" || p.kind === "long_break") &&
    (p.label === null || typeof p.label === "string") &&
    (p.tag_id === null || typeof p.tag_id === "string") &&
    Array.isArray(p.intervals) &&
    p.intervals.length >= 1 &&
    p.intervals.every(isIntervalPayload)
  );
}

export interface FlushResult {
  synced: number;
  dropped: number;
  pending: number;
  needsReauth: boolean;
}

export interface QueueDeps {
  post: (payload: BlockPayload) => Promise<void>;
  hasToken: () => boolean;
  isOnline: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

function defaultPost(payload: BlockPayload): Promise<void> {
  return apiFetch<void>("/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const defaultDeps: QueueDeps = {
  post: defaultPost,
  hasToken: () => isSignedIn(),
  isOnline: () =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  storage: typeof localStorage !== "undefined" ? localStorage : null,
};

export function readQueue(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = defaultDeps.storage
): BlockPayload[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Malformed entries — including the pre-interval envelope shape — are
    // dropped silently here: no toast and no dropped count. readQueue runs on
    // every enqueue and every flush, so firing onBlocksDropped from a read
    // path would double-report; only the flush path reports drops.
    return parsed.filter(isBlockPayload);
  } catch {
    // Corrupt queue is worse than an empty one — reset rather than block sync.
    try {
      storage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

function writeQueue(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
  items: BlockPayload[]
): void {
  if (!storage) return;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* private mode — flush attempts still work in-memory this session */
  }
}

/** Same client UUID replaces its queued copy: the queue is last-write-wins. */
export function enqueueBlock(
  payload: BlockPayload,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = defaultDeps.storage
): void {
  const queue = readQueue(storage);
  const idx = queue.findIndex((i) => i.id === payload.id);
  if (idx >= 0) queue[idx] = payload;
  else queue.push(payload);
  writeQueue(storage, queue);
}

function statusOf(err: unknown): number {
  return err instanceof ApiError ? err.status : 0;
}

const droppedListeners = new Set<(count: number) => void>();

/**
 * Fires when permanently-rejected payloads are dropped. Time spent is time
 * spent (invariant 9), so a drop is data loss and must be visible, not silent.
 */
export function onBlocksDropped(cb: (count: number) => void): () => void {
  droppedListeners.add(cb);
  return () => droppedListeners.delete(cb);
}

let flushing = false;

export async function flushQueue(
  custom?: Partial<QueueDeps>
): Promise<FlushResult> {
  const deps = { ...defaultDeps, ...custom };
  const result: FlushResult = {
    synced: 0,
    dropped: 0,
    pending: 0,
    needsReauth: false,
  };

  const initial = readQueue(deps.storage);
  result.pending = initial.length;
  if (flushing || initial.length === 0) return result;

  flushing = true;
  try {
    // Ids this invocation already POSTed: a mid-flush re-read must never
    // re-send them, so the drain loop below cannot double-POST (invariant 3).
    const attempted = new Set<string>();

    while (true) {
      const queue = readQueue(deps.storage);
      const batch = queue.filter((item) => !attempted.has(item.id));
      if (batch.length === 0) break;

      // What this pass decided to remove, keyed by the serialized copy we
      // actually sent. A same-id re-enqueue (last-write-wins) survives the
      // reconciliation below instead of being deleted along with the old copy.
      const succeeded = new Map<string, string>();
      const dropped = new Map<string, string>();
      let blocked = false;

      for (const item of batch) {
        attempted.add(item.id);
        if (!deps.isOnline()) {
          blocked = true;
          break;
        }
        const sent = JSON.stringify(item);
        try {
          await deps.post(item);
          result.synced++;
          succeeded.set(item.id, sent);
        } catch (err) {
          const status = statusOf(err);
          if (status === 401 || status === 403) {
            result.needsReauth = true;
            blocked = true;
            break;
          }
          if (status >= 400 && status < 500) {
            // Permanently rejected — retrying forever would poison the queue.
            console.warn("block dropped: server rejected payload", item);
            result.dropped++;
            dropped.set(item.id, sent);
            continue;
          }
          blocked = true;
          break;
        }
      }

      // Re-read: the initial snapshot is stale once POSTs are in flight, so
      // remove only entries this pass sent and left unchanged. Anything
      // enqueued during the flush (new id, or a rewritten same-id) is kept.
      const current = readQueue(deps.storage);
      const next = current.filter((item) => {
        const sent = succeeded.get(item.id) ?? dropped.get(item.id);
        if (sent === undefined) return true;
        return JSON.stringify(item) !== sent;
      });
      writeQueue(deps.storage, next);
      result.pending = next.length;

      // A network/auth stop is not a retry: leave the rest for the next flush.
      if (blocked) break;
    }
  } finally {
    flushing = false;
  }

  if (result.dropped > 0) {
    droppedListeners.forEach((cb) => cb(result.dropped));
  }

  return result;
}

/** Enqueue then try to sync. Never rejects — a failed save must not interrupt the timer. */
export async function enqueueAndSync(
  payload: BlockPayload,
  custom?: Partial<QueueDeps>
): Promise<FlushResult> {
  enqueueBlock(payload, custom?.storage ?? defaultDeps.storage);
  return flushQueue(custom);
}

let initialized = false;

/**
 * App-wide sync wiring: initial flush of anything left from a previous
 * session, retry on reconnect, periodic retry while offline. Called from a
 * client effect (QueueSync), never at import time — import-time side
 * effects fire in every bundle that touches this module and can't be
 * tested or torn down.
 */
export function initQueueSync(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  // Reopening the app with a pending queue must sync without waiting for a new block.
  if (readQueue().length > 0) void flushQueue();
  window.addEventListener("online", () => void flushQueue());
  window.setInterval(() => {
    if (readQueue().length > 0) void flushQueue();
  }, RETRY_MS);
}
