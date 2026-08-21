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

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import AppShell from "@/components/shared/AppShell";
import TabBar from "@/components/shared/TabBar";
import Sidebar from "@/components/shared/Sidebar";

const DESTINATIONS = ["/", "/history", "/plan"] as const;

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

describe("navigation destinations", () => {
  it("the tab bar carries exactly three destinations", () => {
    const markup = renderToStaticMarkup(<TabBar />);
    expect(hrefs(markup)).toEqual([...DESTINATIONS]);
    expect(markup).toContain("Timer");
    expect(markup).toContain("History");
    expect(markup).toContain("Plan");
  });

  it("Settings is never a fourth tab — only the header gear reaches it", () => {
    const tabMarkup = renderToStaticMarkup(<TabBar />);
    expect(tabMarkup).not.toContain("/settings");

    const shellMarkup = renderToStaticMarkup(
      <AppShell>
        <p>x</p>
      </AppShell>
    );
    const settingsHrefs = hrefs(shellMarkup).filter((h) =>
      h.startsWith("/settings")
    );
    // The gear — one, mobile header. The sidebar's Settings entry is added
    // below at md: and is also legal (SCR-01); on the shell the count is
    // gear + sidebar entry.
    expect(settingsHrefs.length).toBeGreaterThanOrEqual(1);
    expect(shellMarkup).toContain("⚙");
  });

  it("the active destination is marked with aria-current", () => {
    nav.pathname = "/history";
    const markup = renderToStaticMarkup(<TabBar />);
    const active = [...markup.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map(
      (m) => m[0]
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/history"');
    nav.pathname = "/";
  });

  it("marks one sidebar item on /settings, not Tags as well", () => {
    nav.pathname = "/settings";
    const markup = renderToStaticMarkup(<Sidebar />);
    const active = [...markup.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map(
      (m) => m[0]
    );
    // Tags is a jump into a section of Settings, not a destination of its own.
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/settings"');
    expect(active[0]).not.toContain("#tags");
    nav.pathname = "/";
  });
});

describe("responsive shape (mobile-first)", () => {
  it("mobile renders the tab bar and no sidebar; md: inverts", () => {
    const shell = renderToStaticMarkup(
      <AppShell>
        <p>x</p>
      </AppShell>
    );
    // Tab bar hidden from md up; sidebar hidden until md.
    const tabBar = renderToStaticMarkup(<TabBar />);
    expect(tabBar).toMatch(/class="[^"]*md:hidden/);
    const sidebar = renderToStaticMarkup(<Sidebar />);
    expect(sidebar).toMatch(/class="[^"]*hidden md:flex/);
    // Both shapes are present in the shell; CSS decides which shows.
    expect(shell).toContain("md:hidden");
    expect(shell).toMatch(/hidden md:flex/);
  });
});

describe("module independence of the shell", () => {
  const files = ["TabBar.tsx", "Sidebar.tsx", "AppShell.tsx"];

  it("imports nothing from components/timer or components/plan", () => {
    // Mirrors the ESLint no-restricted-imports rule extended to
    // components/shared/ (S-02) — mechanical so it fails loudly in CI.
    for (const f of files) {
      const src = readFileSync(
        resolve(import.meta.dirname, "../../components/shared", f),
        "utf8"
      );
      const imports = [...src.matchAll(/from "(@\/[^"]+)"/g)].map((m) => m[1]);
      const offenders = imports.filter(
        (i) => i.startsWith("@/components/timer") || i.startsWith("@/components/plan")
      );
      expect(offenders, `${f} must not import timer/plan components`).toEqual([]);
    }
  });

  it("navigates by href, so either module can be deleted and the shell still compiles", () => {
    const markup = renderToStaticMarkup(<TabBar />);
    for (const d of DESTINATIONS) {
      expect(markup).toContain(`href="${d}"`);
    }
  });
});
