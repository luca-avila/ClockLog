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

import { API_BASE, LAST_USER_KEY, clearSession } from "./client";
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
