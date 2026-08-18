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

import { apiFetch, ApiError } from "./client";

export interface BlockPayload {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "completed" | "aborted";
  kind: "focus" | "short_break" | "long_break";
  label: string | null;
  tag_id: string | null;
}

const QUEUE_KEY = "tempo_block_queue";
const RETRY_MS = 30_000;

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
  hasToken: () => typeof window !== "undefined" && !!localStorage.getItem("token"),
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
    return parsed.filter(
      (p): p is BlockPayload =>
        typeof p === "object" && p !== null && "id" in p && "started_at" in p
    );
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

const reauthListeners = new Set<() => void>();

/** Fires when a sync attempt hits an expired session — sync time only, never mid-block. */
export function onReauthNeeded(cb: () => void): () => void {
  reauthListeners.add(cb);
  return () => reauthListeners.delete(cb);
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

    for (const item of queue) {
      if (!deps.isOnline()) {
        remaining.push(item);
        continue;
      }
      try {
        await deps.post(item);
        result.synced++;
      } catch (err) {
        const status = statusOf(err);
        if (status === 401 || status === 403) {
          remaining.push(item, ...queue.slice(queue.indexOf(item) + 1));
          result.needsReauth = true;
          reauthListeners.forEach((cb) => cb());
          break;
        }
        if (status >= 400 && status < 500) {
          // Permanently rejected — retrying forever would poison the queue.
          result.dropped++;
          continue;
        }
        remaining.push(item, ...queue.slice(queue.indexOf(item) + 1));
        break;
      }
    }

    writeQueue(deps.storage, remaining);
    result.pending = remaining.length;
  } finally {
    flushing = false;
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

let triggersAttached = false;

function ensureSyncTriggers(): void {
  if (triggersAttached || typeof window === "undefined") return;
  triggersAttached = true;
  window.addEventListener("online", () => void flushQueue());
  window.setInterval(() => {
    if (readQueue().length > 0) void flushQueue();
  }, RETRY_MS);
}

if (typeof window !== "undefined") {
  // Reopening the app with a pending queue must sync without waiting for a new block.
  if (readQueue().length > 0) void flushQueue();
  ensureSyncTriggers();
}
