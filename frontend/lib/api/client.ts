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

// Cycle with ./session is safe: every cross-module use sits in a function body,
// never at module-evaluation time.
import { handleUnauthorized } from "./session";

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

export function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
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
    // Expired/invalid session: the policy lives in session.ts — one owner (c6).
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
