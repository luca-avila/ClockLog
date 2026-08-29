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

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  // The password-reset screen lands here with ?reset=1: resetting revoked
  // every session, including this browser's. Read from the location, not
  // useSearchParams, so this page stays statically renderable.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      // One-shot URL flag → one-shot notice; there is no event to hang it on.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice(
        "Your password was reset. Every session was signed out — sign in with the new one."
      );
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  // Plain fetch, not apiFetch: a failed login is a form error, never the
  // 401-redirect apiFetch performs for expired sessions.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    setResent(false);
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
        } else if (code === "EMAIL_NOT_VERIFIED") {
          setError("Verify your email address first — check your inbox for the link");
          setUnverified(true);
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

  async function resendVerification() {
    setBusy(true);
    setError(null);
    try {
      // 204 either way — but this branch only renders after the server
      // already said the address exists and is unverified.
      await fetch(`${API_BASE}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
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

        {notice && <p className="text-xs text-neutral-500">{notice}</p>}

        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}

        {resent && <p className="text-xs text-neutral-500">Link sent — check your inbox</p>}

        {unverified ? (
          <PrimaryButton type="button" onClick={resendVerification} disabled={busy}>
            RESEND LINK
          </PrimaryButton>
        ) : (
          <PrimaryButton type="submit" disabled={busy}>
            SIGN IN
          </PrimaryButton>
        )}
      </form>

      <div className="mt-8 flex flex-col gap-1 text-xs text-neutral-400 text-center">
        <Link href="/register" className="hover:text-neutral-600 transition-colors">
          Create an account
        </Link>
        <Link href="/forgot-password" className="hover:text-neutral-600 transition-colors">
          Forgot your password?
        </Link>
      </div>
    </div>
  );
}
