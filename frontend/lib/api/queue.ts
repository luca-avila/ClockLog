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

export interface BlockPayload {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "completed" | "aborted";
  kind: "focus" | "short_break" | "long_break";
  label: string | null;
  tag_id: string | null;
}

const QUEUE_KEY = "clocklog_block_queue";
const RETRY_MS = 30_000;

function isBlockPayload(v: unknown): v is BlockPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" && p.id.length > 0 &&
    typeof p.started_at === "string" &&
    (p.ended_at === null || typeof p.ended_at === "string") &&
    (p.status === "completed" || p.status === "aborted") &&
    (p.kind === "focus" || p.kind === "short_break" || p.kind === "long_break") &&
    (p.label === null || typeof p.label === "string") &&
    (p.tag_id === null || typeof p.tag_id === "string")
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
    // Malformed entries are dropped silently here, as readQueue is called on
    // every enqueue and every flush — firing onBlocksDropped from a read path
    // would double-report. Only the flush path reports drops.
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

  const queue = readQueue(deps.storage);
  result.pending = queue.length;
  if (flushing || queue.length === 0) return result;

  flushing = true;
  try {
    const remaining: BlockPayload[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (!deps.isOnline()) {
        remaining.push(...queue.slice(i));
        break;
      }
      try {
        await deps.post(item);
        result.synced++;
      } catch (err) {
        const status = statusOf(err);
        if (status === 401 || status === 403) {
          remaining.push(...queue.slice(i));
          result.needsReauth = true;
          break;
        }
        if (status >= 400 && status < 500) {
          // Permanently rejected — retrying forever would poison the queue.
          console.warn("block dropped: server rejected payload", item);
          result.dropped++;
          continue;
        }
        remaining.push(...queue.slice(i));
        break;
      }
    }

    writeQueue(deps.storage, remaining);
    result.pending = remaining.length;
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
