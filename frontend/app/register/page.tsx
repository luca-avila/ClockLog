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
import Link from "next/link";
import { API_BASE } from "@/lib/api/client";
import Logo from "@/components/Logo";
import PrimaryButton from "@/components/shared/PrimaryButton";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Plain fetch, not apiFetch: this screen is unauthenticated and apiFetch
  // redirects on 401.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
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
        if (code === "EMAIL_EXISTS") {
          setError("That address is already registered");
        } else if (code === "RATE_LIMITED") {
          setError("Too many attempts — wait a moment and try again");
        } else {
          setError("Could not sign up — try again");
        }
        return;
      }
      // No session yet: the address is not theirs until the link comes back.
      setSentTo(email);
    } catch {
      setError("Could not reach the server — check your connection");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sentTo }),
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
      <p className="text-sm text-neutral-400 mb-8 text-center">Create your account</p>

      {sentTo ? (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-neutral-600">
            Check your inbox — we sent a link to {sentTo}
          </p>
          <p className="text-xs text-neutral-400">
            The link expires in 24 hours. Verifying it signs you in.
          </p>
          {resent && <p className="text-xs text-neutral-500">Link sent — check your inbox</p>}
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Resend the link
          </button>
          <Link href="/login" className="text-xs text-neutral-400 hover:text-neutral-600">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
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
              SIGN UP
            </PrimaryButton>
          </form>

          {error === "That address is already registered" && (
            <p className="mt-4 text-xs text-neutral-400 text-center">
              <Link href="/login" className="hover:text-neutral-600 transition-colors">
                Sign in instead
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
