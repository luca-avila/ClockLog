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
import { adoptSession, authErrorMessage, postAuth } from "@/lib/api/session";
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

  // postAuth never redirects: apiFetch's 401 policy skips public routes
  // (isPublicAuthPath), so a failed login is a form error, not a bounce.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    setResent(false);
    try {
      const result = await postAuth<{ access_token: string }>("/auth/login", {
        email,
        password,
      });
      if (!result.ok) {
        // Flow codes stay here — EMAIL_NOT_VERIFIED flips the form into its
        // resend state; transport codes are the shared helper's copy.
        if (result.code === "EMAIL_NOT_VERIFIED") {
          setError("Verify your email address first — check your inbox for the link");
          setUnverified(true);
        } else if (result.code === "INVALID_CREDENTIALS") {
          setError("Invalid email or password");
        } else {
          setError(authErrorMessage(result.code, "Could not sign in — try again"));
        }
        return;
      }

      // The fence lives in adoptSession: a shared browser must not carry the
      // previous account's state across. Cancelling writes nothing.
      if (await adoptSession(result.data.access_token)) {
        router.push("/");
      }
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
      const result = await postAuth("/auth/resend-verification", { email });
      if (result.ok) {
        setResent(true);
      } else {
        setError(authErrorMessage(result.code, "Could not send the link — try again"));
      }
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

        <PrimaryButton type="submit" disabled={busy}>
          SIGN IN
        </PrimaryButton>

        {/* Resend is not a commit action — a text link, never a swap that hides SIGN IN. */}
        {unverified && !resent && (
          <button
            type="button"
            onClick={resendVerification}
            disabled={busy}
            className="self-center text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Resend verification link
          </button>
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
