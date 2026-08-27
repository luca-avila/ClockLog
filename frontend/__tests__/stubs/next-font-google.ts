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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * `next/font/google` under Vitest.
 *
 * The real module is a build-time transform the Next compiler performs; in a
 * plain Vite run the import resolves to a non-function and any component that
 * loads a font throws. Aliased in `vitest.config.mjs`.
 */

interface LoadedFont {
  className: string;
  variable: string;
  style: { fontFamily: string };
}

function stub(family: string): () => LoadedFont {
  return () => ({
    className: `font-${family}`,
    variable: `--font-${family}`,
    style: { fontFamily: family },
  });
}

export const Geist = stub("geist");
export const Geist_Mono = stub("geist-mono");
