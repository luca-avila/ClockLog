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

import { API_BASE, ApiError, LAST_USER_KEY, apiFetch, clearSession } from "./client";
import { readQueue } from "./queue";

/**
 * The sign-in fence, shared by the sign-in and verify-email screens.
 *
 * The browser is shared: when the new token belongs to a different account
 * than `clocklog_last_user`, every `clocklog_*` key is cleared before the
 * new session starts — otherwise one account's in-progress block and
 * unsynced offline queue follow the next one into the app. With unsynced
 * blocks in the queue the user is asked first; cancelling writes nothing
 * and returns false.
 *
 * Resolves false also when the token's owner cannot be determined: without
 * an id the fence cannot run, and blocking sign-in on that would trade a
 * known risk for a guaranteed dead end.
 */
export async function adoptSession(accessToken: string): Promise<boolean> {
  let userId: string | null = null;
  try {
    const me = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (me.ok) userId = (await me.json())?.id ?? null;
  } catch {
    /* unreachable server right after a successful auth call is unlikely;
       without an id we skip the fence rather than block sign-in */
  }

  const lastUser = localStorage.getItem(LAST_USER_KEY);
  if (userId && lastUser && lastUser !== userId) {
    if (readQueue().length > 0) {
      const ok = confirm(
        "This browser has unsynced blocks from the previous account. " +
          "Signing in as a different account discards them. Continue?"
      );
      if (!ok) return false; // stay put, nothing written
    }
    clearSession();
  }

  localStorage.setItem("token", accessToken);
  if (userId) localStorage.setItem(LAST_USER_KEY, userId);
  return true;
}

const SIGN_OUT_CONFIRM =
  "There are unsynced blocks. Signing out discards them. Continue?";

/**
 * The one sign-out: the same fence as sign-in — dropping unsynced blocks is
 * data loss (invariant 9), so the user is asked first. Returns whether the
 * session was cleared; navigation is the caller's job.
 */
export function signOut(): boolean {
  if (typeof window === "undefined") return false;
  if (readQueue().length > 0 && !confirm(SIGN_OUT_CONFIRM)) return false; // nothing written
  clearSession();
  return true;
}

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

/**
 * Unauthenticated POST for the auth screens: never throws, branches on
 * `code`. apiFetch's 401 policy does not apply here — every auth screen is a
 * public path, so a failed login stays a form error.
 */
export async function postAuth<T>(path: string, body: unknown): Promise<AuthResult<T>> {
  try {
    const data = await apiFetch<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, code: err.code };
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }
}
