"use client";

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

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE, clearSession } from "@/lib/api/client";
import Logo from "@/components/Logo";
import PrimaryButton from "@/components/shared/PrimaryButton";

/**
 * SCR-05, reset half. The landing page of the emailed reset link. Resetting
 * revokes every session of the account — including this browser's — so the
 * way out is a fresh sign-in, not a redirect into the app.
 */
function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  // Plain fetch, not apiFetch: unauthenticated screen.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok || res.status === 204) {
        // Every session was just revoked; this browser's token (if any) is
        // dead weight, and any persisted state belongs to a signed-out world.
        clearSession();
        router.push("/login?reset=1");
        return;
      }
      let code: string | null = null;
      try {
        code = (await res.json())?.code ?? null;
      } catch {
        /* non-JSON error body */
      }
      if (code === "INVALID_RESET_TOKEN") {
        setInvalid(true);
      } else if (code === "RATE_LIMITED") {
        setError("Too many attempts — wait a moment and try again");
      } else {
        setError("Could not reset — try again");
      }
    } catch {
      setError("Could not reach the server — check your connection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xs mx-auto min-h-[80vh] flex flex-col justify-center px-4">
      <h1 className="text-xl text-neutral-800 mb-2 text-center">
        <Logo />
      </h1>
      <p className="text-sm text-neutral-400 mb-8 text-center">Choose a new password</p>

      {invalid ? (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-neutral-600">
            This link is invalid or has expired.
          </p>
          <Link href="/forgot-password" className="text-xs text-neutral-400 hover:text-neutral-600">
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-neutral-400">
              New password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="text-sm text-neutral-700 border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-400 transition-colors"
            />
            <span className="text-xs text-neutral-400">At least 8 characters</span>
          </label>

          {error && (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          )}

          <PrimaryButton type="submit" disabled={busy}>
            RESET PASSWORD
          </PrimaryButton>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary: without one the page cannot
  // be statically rendered.
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
