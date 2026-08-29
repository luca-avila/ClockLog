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

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api/client";
import { adoptSession } from "@/lib/api/session";
import Logo from "@/components/Logo";
import PrimaryButton from "@/components/shared/PrimaryButton";

type State = "verifying" | "signed-in" | "failed";

/**
 * SCR-04. The landing page of the emailed verification link: consumes the
 * token, signs the user in, and moves into the app. Expired links are the
 * common failure — the failure state is a resend form, not a dead end.
 */
function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("verifying");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The token is single-use: StrictMode's double effect must not turn a
  // successful verification into a "link already used" failure.
  const attempted = useRef(false);

  async function verify() {
    // Plain fetch, not apiFetch: unauthenticated screen, and its 401
    // redirect would loop here.
    try {
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setState("failed");
        return;
      }
      const data: { access_token: string } = await res.json();

      // The fence lives in adoptSession (same as sign-in): a shared browser
      // must not carry the previous account's state across.
      if (await adoptSession(data.access_token)) {
        setState("signed-in");
        router.push("/");
      } else {
        setState("failed");
      }
    } catch {
      setState("failed");
    }
  }

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void verify();
    // Runs once per mount: the token is single-use and the URL never changes
    // while this screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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

      {state === "verifying" && (
        <p className="text-sm text-neutral-400 text-center">Verifying your address...</p>
      )}

      {state === "signed-in" && (
        <p className="text-sm text-neutral-400 text-center">Address verified. Opening...</p>
      )}

      {state === "failed" && (
        <>
          <p className="text-sm text-neutral-600 mb-8 text-center">
            This link is invalid or has expired. Enter your address and we will send a new one.
          </p>
          {resent ? (
            <p className="text-sm text-neutral-500 text-center">
              Link sent — check your inbox
            </p>
          ) : (
            <form onSubmit={resend} className="flex flex-col gap-4">
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

              {error && (
                <p className="text-xs text-red-500" role="alert">
                  {error}
                </p>
              )}

              <PrimaryButton type="submit" disabled={busy}>
                RESEND LINK
              </PrimaryButton>
            </form>
          )}
          <p className="mt-8 text-xs text-neutral-400 text-center">
            <Link href="/login" className="hover:text-neutral-600 transition-colors">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary: without one the page cannot
  // be statically rendered.
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
