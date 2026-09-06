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

import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import Sheet from "@/components/shared/Sheet";
import Toast from "@/components/shared/Toast";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("Sheet primitive (c8)", () => {
  it("owns the overlay rules: 56px tab-bar clearance, z above Toast and the bar, backdrop", () => {
    const markup = renderToStaticMarkup(
      <Sheet onClose={() => {}}>
        <p>content</p>
      </Sheet>
    );
    // bottom-16 clears the 56px tab bar on mobile; md:bottom-0 takes the
    // full band once the bar is gone (the md: centered-dialog variant).
    expect(markup).toContain("bottom-16");
    expect(markup).toContain("md:bottom-0");
    expect(markup).toContain("z-50");
    expect(markup).toContain("bg-black/30");
  });

  it("marks the panel as a modal dialog and renders children untouched", () => {
    const markup = renderToStaticMarkup(
      <Sheet onClose={() => {}}>
        <p className="mine">my content</p>
      </Sheet>
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('class="mine"');
    expect(markup).toContain("my content");
  });

  it("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <Sheet onClose={onClose}>
          <p>content</p>
        </Sheet>
      )
    );
    const backdrop = container.querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();
    act(() => backdrop!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Toast primitive (c8)", () => {
  it('slot="app" is the centered app-wide slot', () => {
    const markup = renderToStaticMarkup(
      <Toast slot="app">
        <p>x</p>
      </Toast>
    );
    expect(markup).toContain("bottom-16");
    expect(markup).toContain("md:bottom-4");
    expect(markup).toContain("z-40");
    expect(markup).toContain("left-1/2");
    expect(markup).toContain("-translate-x-1/2");
    expect(markup).not.toContain("right-4");
  });

  it('slot="page" is the right-hand page-scoped slot', () => {
    const markup = renderToStaticMarkup(
      <Toast slot="page">
        <p>x</p>
      </Toast>
    );
    expect(markup).toContain("bottom-16");
    expect(markup).toContain("md:bottom-4");
    expect(markup).toContain("z-40");
    expect(markup).toContain("right-4");
    expect(markup).not.toContain("left-1/2");
  });

  it("renders the caller's pill and role unchanged", () => {
    const markup = renderToStaticMarkup(
      <Toast slot="app">
        <div role="alert" className="bg-amber-50">
          boom
        </div>
      </Toast>
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("bg-amber-50");
    expect(markup).toContain("boom");
  });

  it("injects no tone of its own: without a role-bearing child there is no role", () => {
    const markup = renderToStaticMarkup(
      <Toast slot="page">
        <p>quietly saved</p>
      </Toast>
    );
    expect(markup).not.toContain('role="alert"');
  });
});
