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

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** The account this browser was last signed in as — user id, set on sign-in. */
export const LAST_USER_KEY = "clocklog_last_user";

/**
 * Clears the token and EVERY `clocklog_*` key. By prefix, not by list:
 * shared/ cannot know the feature modules' key names (invariant 11), and a
 * new persisted key must not silently survive an account switch.
 */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("token");
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("clocklog_")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Structured API error: the backend returns a stable `code` on every
 * error and callers should branch on it, not parse strings.
 */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function isSignedIn(): boolean {
  return getToken() !== null;
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * The routes where a 401 is a form error, never a redirect. A screen listed
 * here is unauthenticated by design; add a future public screen here.
 */
const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.has(pathname);
}

/**
 * Expired/invalid session: drop the stale token and go sign in again.
 * Called by apiFetch on 401. Only the token is dropped — the offline queue
 * and the clock survive a re-sign-in; the full `clocklog_*` sweep belongs to
 * the fences that ask first (invariant 9).
 */
export function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
  if (isPublicAuthPath(window.location.pathname)) return;
  // Hard navigation on purpose: runs outside React, mid-promise, and must
  // tear down whatever screen made the request.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    // Expired/invalid session: the 401 policy above is the one owner (c6).
    if (res.status === 401 && typeof window !== "undefined") {
      handleUnauthorized();
    }
    const body = await res.text().catch(() => "");
    let code = "UNKNOWN";
    let message = `${res.status} ${body}`;
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string };
      if (parsed && typeof parsed.code === "string") code = parsed.code;
      if (parsed && typeof parsed.message === "string") message = parsed.message;
    } catch {
      /* non-JSON body — keep the status + raw text */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
