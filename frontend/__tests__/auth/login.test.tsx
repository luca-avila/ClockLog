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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LoginScreen from "@/components/auth/LoginScreen";
import { withProviders } from "@/__tests__/helpers/providers";

const adoptSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/session", async (importOriginal) => {
  // Only the fence is stubbed: authCall is the real implementation, which is
  // what makes these tests exercise the typed client against the fetch mock.
  const actual = await importOriginal<typeof import("@/lib/api/session")>();
  return { ...actual, adoptSession };
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<(request: Request) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);
let navigate: ReturnType<typeof vi.spyOn>;

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const { element, router } = withProviders(<LoginScreen />, { path: "/login" });
  navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
  act(() => root.render(element));
  return { container, root };
}

/** The URLs the client requested, in order — openapi-fetch sends Requests. */
function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([request]) => request.url);
}

const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!.set!;

function setVal(input: HTMLInputElement, value: string) {
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillForm(container: HTMLElement) {
  const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  setVal(email, "user@example.com");
  setVal(password, "secret12");
}

async function submit(container: HTMLElement) {
  await act(async () => {
    (container.querySelector('button[type="submit"]') as HTMLElement).click();
  });
}

function unverifiedFetch() {
  return new Response(JSON.stringify({ code: "EMAIL_NOT_VERIFIED" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  adoptSession.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("login — SIGN IN always available (SCR-02)", () => {
  it("keeps SIGN IN available after EMAIL_NOT_VERIFIED, with resend as a secondary action", async () => {
    fetchMock.mockResolvedValue(unverifiedFetch());
    const { container } = setup();
    fillForm(container);
    await submit(container);

    const signIn = container.querySelector('button[type="submit"]')!;
    expect(signIn).toBeTruthy();
    expect(signIn.textContent).toContain("SIGN IN");

    const resend = [...container.querySelectorAll("button")].find((b) =>
      /resend/i.test(b.textContent ?? "")
    );
    expect(resend).toBeTruthy();
    expect(resend!.getAttribute("type")).toBe("button");
  });

  it("retries login successfully after verifying in another tab — no reload", async () => {
    fetchMock.mockResolvedValueOnce(unverifiedFetch()).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "tok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    adoptSession.mockResolvedValueOnce(true);
    const { container } = setup();
    fillForm(container);
    await submit(container);
    await submit(container);

    expect(navigate).toHaveBeenCalledWith({ to: "/" });
    const loginCalls = requestedUrls().filter((url) => url.includes("/auth/login"));
    expect(loginCalls).toHaveLength(2);
  });

  it("resend fires /auth/resend-verification and keeps SIGN IN", async () => {
    fetchMock
      .mockResolvedValueOnce(unverifiedFetch())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { container } = setup();
    fillForm(container);
    await submit(container);

    await act(async () => {
      const resend = [...container.querySelectorAll("button")].find((b) =>
        /resend/i.test(b.textContent ?? "")
      )!;
      resend.click();
    });

    expect(requestedUrls().some((url) => url.includes("/auth/resend-verification"))).toBe(true);
    expect(container.textContent).toContain("Link sent — check your inbox");
    expect(container.querySelector('button[type="submit"]')!.textContent).toContain("SIGN IN");
  });
});
