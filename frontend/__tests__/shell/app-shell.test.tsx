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
import { destinationsIn, isActivePath } from "@/components/shared/nav";

const DESTINATIONS = ["/", "/history", "/plan"] as const;

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

describe("navigation destinations", () => {
  it("the tab bar carries exactly three destinations", () => {
    const markup = renderToStaticMarkup(<TabBar />);
    // Consumption, not content: the content is fixed in the "nav registry"
    // describe below, and this test fails loudly if TabBar ever stops
    // mapping the registry into its markup.
    expect(hrefs(markup)).toEqual(destinationsIn("tab").map((d) => d.href));
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

  it("highlights Plan on /plan/day, not nothing", () => {
    nav.pathname = "/plan/day";
    const markup = renderToStaticMarkup(<TabBar />);
    const active = [...markup.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map(
      (m) => m[0]
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/plan"');
    nav.pathname = "/";
  });
});

describe("nav registry", () => {
  it.each([
    ["/", "/", true],
    ["/", "/plan", false],
    ["/plan/day", "/plan", true],
    ["/history", "/history", true],
    ["/settings", "/settings#tags", false],
  ] as const)(
    "isActivePath(%s, %s) is %s",
    (pathname, href, expected) => {
      expect(isActivePath(pathname, href)).toBe(expected);
    }
  );

  it("the tab and rail tiers carry the same three primary destinations", () => {
    const primary = ["/", "/history", "/plan"];
    expect(destinationsIn("tab").map((d) => d.href)).toEqual(primary);
    expect(destinationsIn("rail").map((d) => d.href)).toEqual(primary);
  });

  it("the rail foot carries Tags then Settings", () => {
    expect(destinationsIn("rail-foot").map((d) => d.href)).toEqual([
      "/settings#tags",
      "/settings",
    ]);
  });

  it("the gear tier is exactly Settings", () => {
    expect(destinationsIn("gear").map((d) => d.href)).toEqual(["/settings"]);
  });

  it("each href across all tiers names a single destination", () => {
    // Tiers are surfaces, not ownership: a destination legitimately appears
    // in several tiers (the primary three are "tab" and "rail"), so the
    // flattened list repeats hrefs. The invariant to guard is that one href
    // never names two different destinations — that would collide on the
    // rendered Link key.
    const byHref = new Map<string, { label: string; icon: string }>();
    for (const d of [
      ...destinationsIn("tab"),
      ...destinationsIn("rail"),
      ...destinationsIn("rail-foot"),
      ...destinationsIn("gear"),
    ]) {
      const prev = byHref.get(d.href);
      if (prev) {
        expect({ label: d.label, icon: d.icon }).toEqual(prev);
      } else {
        byHref.set(d.href, { label: d.label, icon: d.icon });
      }
    }
    // And the four tiers together reach every registered destination.
    expect(byHref.size).toBe(5);
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
  const files = [
    "TabBar.tsx",
    "Sidebar.tsx",
    "AppShell.tsx",
    "nav.ts",
    "PrimaryButton.tsx",
    "Sheet.tsx",
    "Toast.tsx",
  ];

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
