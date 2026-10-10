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

import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema.gen";

/** Baked in at build time (Vite inlines `import.meta.env.VITE_*`). */
export const API_BASE: string = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Every request and response body the backend declares, generated from its
 *  OpenAPI schema (`npm run gen:api`). Change a Pydantic schema, regenerate,
 *  and `tsc` points at every screen the change breaks. */
export type Schemas = components["schemas"];

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
  window.location.href = "/login";
}

/** The bearer header on every request that does not already carry one, and
 *  the 401 policy above on every response. adoptSession passes its own header
 *  for a token it has not stored yet; that one wins. */
const session: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token && !request.headers.has("Authorization")) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  onResponse({ response }) {
    // Expired/invalid session: the 401 policy above is the one owner (c6).
    if (response.status === 401) handleUnauthorized();
    return response;
  },
};

/**
 * The typed API client. Paths, params, bodies and responses all come from
 * `schema.gen.ts`, so a call the backend no longer accepts fails `tsc`.
 * `fetch` is resolved per call, not captured at creation, so tests can stub
 * the global after this module has loaded.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE,
  fetch: (request) => globalThis.fetch(request),
});
api.use(session);

/** What every openapi-fetch call resolves to, reduced to what unwrap reads. */
interface CallResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * The data of a successful call, or an ApiError carrying the backend's stable
 * `code` (UNKNOWN for a non-JSON body). A network failure rejects with the
 * fetch TypeError, as before. Query functions and mutations go through this,
 * so TanStack Query sees one error shape.
 */
export async function unwrap<T>(call: Promise<CallResult<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (response.ok) return data as T;
  let code = "UNKNOWN";
  let message = `${response.status} ${typeof error === "string" ? error : ""}`.trim();
  if (typeof error === "object" && error !== null) {
    const body = error as { code?: unknown; message?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string") message = body.message;
  }
  throw new ApiError(response.status, code, message);
}
