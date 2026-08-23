// Tempo — a Pomodoro timer and weekly planner
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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import Logo from "@/components/Logo";
import LogoMark from "@/components/LogoMark";

/**
 * Proof sheet for the wordmark — not part of the app's navigation. Each row
 * sets only a font-size; if the ring holds its proportion and sits on the
 * baseline at all three, the em sizing is right.
 */

const SIZES = [16, 24, 48] as const;

export default function LogoPreviewPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-900">
      <h1 className="mb-8 text-sm uppercase tracking-widest text-neutral-500">Logo</h1>

      <section className="divide-y divide-neutral-200 border-y border-neutral-200">
        {SIZES.map((size) => (
          <div key={size} className="flex items-baseline gap-6 py-6">
            <span className="w-12 shrink-0 font-mono text-xs text-neutral-400">{size}px</span>
            {/* The underline is the text baseline: the ring should overshoot
                it by a hair, exactly as the "p" bowl and an "o" would. */}
            <span
              style={{ fontSize: size }}
              className="border-b border-neutral-300 leading-none"
            >
              <Logo />
            </span>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-sm uppercase tracking-widest text-neutral-500">Mark</h2>
        <div className="flex items-center gap-6">
          <LogoMark className="h-4 w-4" />
          <LogoMark className="h-8 w-8" />
          <LogoMark className="h-16 w-16" />
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 text-white">
            <LogoMark className="h-8 w-8" />
          </span>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-sm uppercase tracking-widest text-neutral-500">Inherits color</h2>
        <p className="text-neutral-400" style={{ fontSize: 24 }}>
          <Logo />
        </p>
        <p className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white" style={{ fontSize: 24 }}>
          <Logo />
        </p>
      </section>
    </main>
  );
}
