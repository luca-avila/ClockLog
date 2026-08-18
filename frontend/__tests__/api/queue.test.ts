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

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueBlock,
  enqueueAndSync,
  flushQueue,
  readQueue,
  onReauthNeeded,
  type QueueDeps,
  type BlockPayload,
} from "@/lib/api/queue";
import { ApiError } from "@/lib/api/client";

function payload(id: string, label = "Work"): BlockPayload {
  return {
    id,
    started_at: "2026-08-15T10:00:00.000Z",
    ended_at: "2026-08-15T10:25:00.000Z",
    status: "completed",
    kind: "focus",
    label,
    tag_id: null,
  };
}

function makeDeps(
  post: QueueDeps["post"],
  overrides: Partial<QueueDeps> = {}
): QueueDeps {
  return {
    post,
    hasToken: () => true,
    isOnline: () => true,
    storage: localStorage,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("offline queue", () => {
  it("enqueues offline, syncs once on reconnect, never duplicates", async () => {
    const post = vi.fn<(p: BlockPayload) => Promise<void>>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(undefined);
    const deps = makeDeps(post);

    const r1 = await flushQueue(deps);
    expect(r1.pending).toBe(0);

    enqueueBlock(payload("a"), localStorage);
    const r2 = await flushQueue(deps);
    expect(r2).toMatchObject({ synced: 0, pending: 1, needsReauth: false });

    const r3 = await flushQueue(deps);
    expect(r3).toMatchObject({ synced: 1, pending: 0 });
    expect(post).toHaveBeenCalledTimes(2);

    await flushQueue(deps);
    expect(post).toHaveBeenCalledTimes(2);
    expect(readQueue(localStorage)).toHaveLength(0);
  });

  it("does not attempt fetch while offline", async () => {
    const post = vi.fn<(p: BlockPayload) => Promise<void>>().mockResolvedValue(undefined);
    const deps = makeDeps(post, { isOnline: () => false });

    enqueueBlock(payload("a"), localStorage);
    const r = await flushQueue(deps);
    expect(post).not.toHaveBeenCalled();
    expect(r.pending).toBe(1);
  });

  it("same client UUID replaces the queued payload (last write wins)", async () => {
    const post = vi.fn<(p: BlockPayload) => Promise<void>>().mockResolvedValue(undefined);
    const deps = makeDeps(post);

    enqueueBlock(payload("x", "first attempt"), localStorage);
    enqueueBlock(payload("x", "second attempt"), localStorage);
    expect(readQueue(localStorage)).toHaveLength(1);

    await flushQueue(deps);
    expect(post).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "x", label: "second attempt" })
    );
  });

  it("expired session keeps the queue and stops, without rejecting the caller", async () => {
    const post = vi.fn<(p: BlockPayload) => Promise<void>>()
      .mockRejectedValue(new ApiError(401, "INVALID_TOKEN", "Invalid or expired token"));
    const deps = makeDeps(post);
    const reauth = vi.fn();
    onReauthNeeded(reauth);

    enqueueBlock(payload("a"), localStorage);
    enqueueBlock(payload("b"), localStorage);

    // The timer is never interrupted: the save path resolves rather than throws.
    await expect(enqueueAndSync(payload("c"), deps)).resolves.toBeDefined();

    const r = await flushQueue(deps);
    expect(r.needsReauth).toBe(true);
    expect(r.pending).toBe(3);
    expect(reauth).toHaveBeenCalled();
    // Each flush stops at the first 401 — one POST per attempt, not one per block.
    expect(post).toHaveBeenCalledTimes(2);
    expect(readQueue(localStorage)).toHaveLength(3);
  });

  it("drops a permanently-rejected payload so it cannot poison the queue", async () => {
    const post = vi.fn<(p: BlockPayload) => Promise<void>>()
      .mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "bad payload"))
      .mockResolvedValue(undefined);
    const deps = makeDeps(post);

    enqueueBlock(payload("bad"), localStorage);
    enqueueBlock(payload("good"), localStorage);

    const r = await flushQueue(deps);
    expect(r).toMatchObject({ synced: 1, dropped: 1, pending: 0 });
    expect(readQueue(localStorage)).toHaveLength(0);
  });

  it("concurrent flushes do not double-POST", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const post = vi.fn<(p: BlockPayload) => Promise<void>>().mockImplementation(() => gate.then(() => undefined));
    const deps = makeDeps(post);

    enqueueBlock(payload("a"), localStorage);
    const first = flushQueue(deps);
    const second = await flushQueue(deps);
    release();
    await first;

    expect(second.synced).toBe(0);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("retries after going back online", async () => {
    let online = false;
    const post = vi.fn<(p: BlockPayload) => Promise<void>>().mockImplementation(() =>
      online ? Promise.resolve(undefined) : Promise.reject(new Error("fetch failed"))
    );
    const deps = makeDeps(post, { isOnline: () => online });

    enqueueBlock(payload("a"), localStorage);
    await flushQueue(deps);
    expect(post).not.toHaveBeenCalled();

    online = true;
    const r = await flushQueue(deps);
    expect(r.synced).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("survives corrupt storage by resetting", () => {
    localStorage.setItem("tempo_block_queue", "not json{{{");
    expect(readQueue(localStorage)).toEqual([]);
    enqueueBlock(payload("a"), localStorage);
    expect(readQueue(localStorage)).toHaveLength(1);
  });
});
