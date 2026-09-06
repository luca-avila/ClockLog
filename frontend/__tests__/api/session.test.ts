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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LAST_USER_KEY, clearSession } from "@/lib/api/client";
import { enqueueBlock, type BlockPayload } from "@/lib/api/queue";
import { adoptSession, handleUnauthorized, isPublicAuthPath, postAuth, signOut } from "@/lib/api/session";

function blockPayload(id: string): BlockPayload {
  return {
    id,
    started_at: "2026-08-15T10:00:00.000Z",
    ended_at: "2026-08-15T10:25:00.000Z",
    status: "completed",
    kind: "focus",
    label: "Work",
    tag_id: null,
  };
}

function meEndpoint(userId: string): Response {
  return new Response(JSON.stringify({ id: userId, email: "x@y.z" }), { status: 200 });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("clearSession", () => {
  it("removes the token and every clocklog_* key", () => {
    localStorage.setItem("token", "t");
    localStorage.setItem("clocklog_clock", "{}");
    localStorage.setItem("clocklog_cycle", "2");
    localStorage.setItem("clocklog_block_queue", "[]");
    localStorage.setItem("clocklog_last_user", "u1");

    clearSession();

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("clocklog_clock")).toBeNull();
    expect(localStorage.getItem("clocklog_cycle")).toBeNull();
    expect(localStorage.getItem("clocklog_block_queue")).toBeNull();
    expect(localStorage.getItem("clocklog_last_user")).toBeNull();
  });

  it("leaves keys outside the clocklog_ namespace alone", () => {
    localStorage.setItem("token", "t");
    localStorage.setItem("unrelated", "keep-me");

    clearSession();

    expect(localStorage.getItem("unrelated")).toBe("keep-me");
  });
});

describe("adoptSession", () => {
  it("writes the token and last-user id for a first sign-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(meEndpoint("user-1"));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await adoptSession("tok-1");

    expect(ok).toBe(true);
    expect(localStorage.getItem("token")).toBe("tok-1");
    expect(localStorage.getItem(LAST_USER_KEY)).toBe("user-1");
  });

  it("clears the previous account's state before writing the new token", async () => {
    // Previous account left state behind.
    localStorage.setItem("token", "old-token");
    localStorage.setItem(LAST_USER_KEY, "user-1");
    localStorage.setItem("clocklog_clock", '{"startedAt":1}');

    const fetchMock = vi.fn().mockResolvedValue(meEndpoint("user-2"));
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);

    const ok = await adoptSession("new-token");

    expect(ok).toBe(true);
    // No confirmation needed: the queue was empty.
    expect(confirmMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBe("new-token");
    expect(localStorage.getItem(LAST_USER_KEY)).toBe("user-2");
    expect(localStorage.getItem("clocklog_clock")).toBeNull();
  });

  it("asks for confirmation when the queue is not empty, and cancelling writes nothing", async () => {
    localStorage.setItem("token", "old-token");
    localStorage.setItem(LAST_USER_KEY, "user-1");
    enqueueBlock(blockPayload("b-1"));

    const fetchMock = vi.fn().mockResolvedValue(meEndpoint("user-2"));
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);

    const ok = await adoptSession("new-token");

    expect(ok).toBe(false);
    expect(confirmMock).toHaveBeenCalledOnce();
    // Nothing written, nothing wiped: the user stays exactly as they were.
    expect(localStorage.getItem("token")).toBe("old-token");
    expect(localStorage.getItem(LAST_USER_KEY)).toBe("user-1");
    expect(localStorage.getItem("clocklog_block_queue")).not.toBeNull();
  });

  it("clears without asking when the user accepts the data loss", async () => {
    localStorage.setItem("token", "old-token");
    localStorage.setItem(LAST_USER_KEY, "user-1");
    enqueueBlock(blockPayload("b-1"));

    const fetchMock = vi.fn().mockResolvedValue(meEndpoint("user-2"));
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);

    const ok = await adoptSession("new-token");

    expect(ok).toBe(true);
    expect(localStorage.getItem("token")).toBe("new-token");
    expect(localStorage.getItem("clocklog_block_queue")).toBeNull();
  });

  it("same account signing in again keeps its state", async () => {
    localStorage.setItem("token", "old-token");
    localStorage.setItem(LAST_USER_KEY, "user-1");
    localStorage.setItem("clocklog_clock", '{"startedAt":1}');

    const fetchMock = vi.fn().mockResolvedValue(meEndpoint("user-1"));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await adoptSession("fresh-token");

    expect(ok).toBe(true);
    expect(localStorage.getItem("token")).toBe("fresh-token");
    expect(localStorage.getItem("clocklog_clock")).toBe('{"startedAt":1}');
  });
});

describe("isPublicAuthPath", () => {
  it("lists the unauthenticated screens", () => {
    for (const p of ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"]) {
      expect(isPublicAuthPath(p)).toBe(true);
    }
  });

  it("excludes app routes and near-misses", () => {
    for (const p of ["/", "/history", "/settings", "/loginx"]) {
      expect(isPublicAuthPath(p)).toBe(false);
    }
  });
});

describe("handleUnauthorized", () => {
  it("drops only the stale token — the queue and the clock survive a 401", () => {
    // A public route, so the redirect half of the policy stays out of the way.
    window.history.replaceState(null, "", "/login");
    localStorage.setItem("token", "stale");
    localStorage.setItem("clocklog_clock", '{"startedAt":1}');
    localStorage.setItem("clocklog_block_queue", "[]");

    handleUnauthorized();

    expect(localStorage.getItem("token")).toBeNull();
    // Token-only sweep on 401: the full clocklog_* wipe belongs to the fences,
    // which ask the user first (invariant 9).
    expect(localStorage.getItem("clocklog_clock")).toBe('{"startedAt":1}');
    expect(localStorage.getItem("clocklog_block_queue")).toBe("[]");
  });
});

describe("signOut", () => {
  it("clears the session without asking when the queue is empty", () => {
    localStorage.setItem("token", "t");
    localStorage.setItem("clocklog_clock", '{"startedAt":1}');
    const confirmMock = vi.fn();
    vi.stubGlobal("confirm", confirmMock);

    expect(signOut()).toBe(true);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("clocklog_clock")).toBeNull();
  });

  it("sweeps everything once the user accepts the data loss", () => {
    localStorage.setItem("token", "t");
    enqueueBlock(blockPayload("b-1"));
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);

    expect(signOut()).toBe(true);
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("clocklog_block_queue")).toBeNull();
  });

  it("cancelling writes nothing and wipes nothing", () => {
    localStorage.setItem("token", "t");
    enqueueBlock(blockPayload("b-1"));
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);

    expect(signOut()).toBe(false);
    expect(localStorage.getItem("token")).toBe("t");
    expect(localStorage.getItem("clocklog_block_queue")).not.toBeNull();
  });
});

describe("postAuth", () => {
  it("returns { ok: true, data } on a success JSON response", async () => {
    const res = new Response(JSON.stringify({ access_token: "tok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const result = await postAuth<{ access_token: string }>("/auth/login", {
      email: "u@example.com",
      password: "secret12",
    });

    expect(result).toEqual({ ok: true, data: { access_token: "tok" } });
  });

  it("returns { ok: false, code } on a JSON error body", async () => {
    window.history.replaceState(null, "", "/login");
    const res = new Response(
      JSON.stringify({ code: "INVALID_CREDENTIALS", message: "Bad email or password" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const result = await postAuth("/auth/login", {
      email: "u@example.com",
      password: "wrong",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });

  it("maps a non-JSON error body to code UNKNOWN", async () => {
    const res = new Response("<html>bad gateway</html>", { status: 502 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const result = await postAuth("/auth/login", { email: "u@example.com", password: "x" });

    expect(result).toMatchObject({ ok: false, status: 502, code: "UNKNOWN" });
  });

  it("maps a rejected fetch to NETWORK_ERROR, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await postAuth("/auth/login", { email: "u@example.com", password: "x" });

    expect(result).toEqual({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });
});
