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
import { authErrorMessage, postAuth } from "@/lib/api/session";
import Logo from "@/components/Logo";
import PrimaryButton from "@/components/shared/PrimaryButton";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // postAuth never redirects: unauthenticated screen on a public route.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The answer is 204 whether or not the address exists — the screen
      // must not reveal that either.
      const result = await postAuth("/auth/forgot-password", { email });
      if (result.ok) {
        setSent(true);
      } else {
        setError(authErrorMessage(result.code, "Could not send — try again"));
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
      <p className="text-sm text-neutral-400 mb-8 text-center">Reset your password</p>

      {sent ? (
        <p className="text-sm text-neutral-600 text-center">
          If that address has an account, the link is on its way.
        </p>
      ) : (
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

          {error && (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          )}

          <PrimaryButton type="submit" disabled={busy}>
            SEND LINK
          </PrimaryButton>
        </form>
      )}

      <p className="mt-8 text-xs text-neutral-400 text-center">
        <Link href="/login" className="hover:text-neutral-600 transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
