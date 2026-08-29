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

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, LAST_USER_KEY, clearSession } from "@/lib/api/client";
import { readQueue } from "@/lib/api/queue";
import Logo from "@/components/Logo";
import PrimaryButton from "@/components/shared/PrimaryButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Plain fetch, not apiFetch: a failed login is a form error, never the
  // 401-redirect apiFetch performs for expired sessions.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        let code: string | null = null;
        try {
          code = (await res.json())?.code ?? null;
        } catch {
          /* non-JSON error body */
        }
        if (code === "INVALID_CREDENTIALS") {
          setError("Invalid email or password");
        } else if (code === "RATE_LIMITED") {
          setError("Too many attempts — wait a moment and try again");
        } else {
          setError("Could not sign in — try again");
        }
        return;
      }
      const data: { access_token: string } = await res.json();

      // Who is this token for? Needed before writing anything: a shared
      // browser must not carry the previous account's state across.
      let userId: string | null = null;
      try {
        const me = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (me.ok) userId = (await me.json())?.id ?? null;
      } catch {
        /* unreachable server right after a successful login is unlikely;
           without an id we skip the fence rather than block sign-in */
      }

      const lastUser = localStorage.getItem(LAST_USER_KEY);
      if (userId && lastUser && lastUser !== userId) {
        if (readQueue().length > 0) {
          const ok = confirm(
            "This browser has unsynced blocks from the previous account. " +
              "Signing in as a different account discards them. Continue?"
          );
          if (!ok) return; // stay on the login screen, nothing written
        }
        clearSession();
      }

      localStorage.setItem("token", data.access_token);
      if (userId) localStorage.setItem(LAST_USER_KEY, userId);
      router.push("/");
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
      <p className="text-sm text-neutral-400 mb-8 text-center">Sign in to continue</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-neutral-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="text-sm text-neutral-700 border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-400 transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-neutral-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="text-sm text-neutral-700 border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-400 transition-colors"
          />
        </label>

        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          SIGN IN
        </PrimaryButton>
      </form>
    </div>
  );
}
