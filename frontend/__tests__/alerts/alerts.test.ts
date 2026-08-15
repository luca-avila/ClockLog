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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  planAlert,
  fireAlert,
  readHasCompletedBlock,
  markBlockCompleted,
  type AlertDeps,
  type AlertPlan,
  type NotificationPermissionState,
} from "@/lib/alerts";

function baseCtx(
  overrides: Partial<Parameters<typeof planAlert>[0]> = {}
) {
  return {
    settings: { sound: true, notifications: true },
    permission: "default" as const,
    hasCompletedBlock: false,
    ...overrides,
  };
}

describe("planAlert", () => {
  it("always sets changeTitle (visual never omitted)", () => {
    const denied = planAlert(
      baseCtx({ permission: "denied", settings: { sound: false, notifications: false } })
    );
    expect(denied.changeTitle).toBe(true);

    const muted = planAlert(
      baseCtx({ settings: { sound: true, notifications: false } })
    );
    expect(muted.changeTitle).toBe(true);
    expect(muted.playSound).toBe(true);
  });

  it("with notifications denied: audio + title, no notification, no permission prompt", () => {
    const plan = planAlert(
      baseCtx({
        permission: "denied",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: true },
      })
    );
    expect(plan).toEqual<AlertPlan>({
      playSound: true,
      showNotification: false,
      changeTitle: true,
      requestPermission: false,
    });
  });

  it("never requests permission before the first completed block", () => {
    const plan = planAlert(
      baseCtx({
        permission: "default",
        hasCompletedBlock: false,
        settings: { sound: true, notifications: true },
      })
    );
    expect(plan.requestPermission).toBe(false);
  });

  it("requests permission only after first completed block while still default", () => {
    const plan = planAlert(
      baseCtx({
        permission: "default",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: true },
      })
    );
    expect(plan.requestPermission).toBe(true);
    expect(plan.showNotification).toBe(false);
  });

  it("does not request permission when notifications setting is OFF", () => {
    const plan = planAlert(
      baseCtx({
        permission: "default",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: false },
      })
    );
    expect(plan.requestPermission).toBe(false);
  });

  it("shows notification only when granted and setting ON", () => {
    const granted = planAlert(
      baseCtx({
        permission: "granted",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: true },
      })
    );
    expect(granted.showNotification).toBe(true);
    expect(granted.requestPermission).toBe(false);

    const off = planAlert(
      baseCtx({
        permission: "granted",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: false },
      })
    );
    expect(off.showNotification).toBe(false);
  });

  it("sound setting gates playSound independently", () => {
    expect(
      planAlert(
        baseCtx({ settings: { sound: false, notifications: true }, permission: "granted" })
      ).playSound
    ).toBe(false);
    expect(
      planAlert(
        baseCtx({ settings: { sound: true, notifications: false }, permission: "denied" })
      ).playSound
    ).toBe(true);
  });

  it("unsupported permission never shows notification or requests", () => {
    const plan = planAlert(
      baseCtx({
        permission: "unsupported",
        hasCompletedBlock: true,
        settings: { sound: true, notifications: true },
      })
    );
    expect(plan.showNotification).toBe(false);
    expect(plan.requestPermission).toBe(false);
    expect(plan.playSound).toBe(true);
    expect(plan.changeTitle).toBe(true);
  });
});

describe("fireAlert channel independence", () => {
  let playSound: ReturnType<typeof vi.fn<() => void>>;
  let showNotification: ReturnType<
    typeof vi.fn<(title: string, body: string) => void>
  >;
  let setTitle: ReturnType<typeof vi.fn<(title: string) => void>>;
  let requestPermission: ReturnType<
    typeof vi.fn<() => Promise<NotificationPermissionState>>
  >;

  let deps: AlertDeps;

  beforeEach(() => {
    playSound = vi.fn();
    showNotification = vi.fn();
    setTitle = vi.fn();
    requestPermission = vi.fn().mockResolvedValue("granted");
    deps = {
      getPermission: () => "granted",
      requestPermission,
      showNotification,
      playSound,
      setTitle,
      getTitle: () => "Tempo",
      now: () => 0,
    };
  });

  it("runs sound + notification + title when all available", () => {
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: true,
        title: "Focus done",
        body: "Time for a break",
      },
      deps
    );
    expect(playSound).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledWith("Focus done", "Time for a break");
    expect(setTitle).toHaveBeenCalledWith("Focus done");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("when notifications denied: sound + title only, never blocks on permission", () => {
    deps.getPermission = () => "denied";
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: true,
        title: "Focus done",
        body: "Time for a break",
      },
      deps
    );
    expect(playSound).toHaveBeenCalledOnce();
    expect(showNotification).not.toHaveBeenCalled();
    expect(setTitle).toHaveBeenCalledWith("Focus done");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("permission request is non-blocking and only after first block", async () => {
    deps.getPermission = () => "default";
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: true,
        title: "Focus done",
        body: "ok",
      },
      deps
    );
    expect(requestPermission).toHaveBeenCalledOnce();
    // fireAlert returns without awaiting permission
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("does not request permission before first completed block", () => {
    deps.getPermission = () => "default";
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: false,
        title: "Focus done",
        body: "ok",
      },
      deps
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("sound failure does not prevent title or notification", () => {
    deps.playSound = vi.fn(() => {
      throw new Error("autoplay blocked");
    });
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: true,
        title: "Focus done",
        body: "ok",
      },
      deps
    );
    expect(showNotification).toHaveBeenCalledOnce();
    expect(setTitle).toHaveBeenCalledWith("Focus done");
  });

  it("notification failure does not prevent sound or title", () => {
    deps.showNotification = vi.fn(() => {
      throw new Error("quota");
    });
    fireAlert(
      {
        settings: { sound: true, notifications: true },
        hasCompletedBlock: true,
        title: "Focus done",
        body: "ok",
      },
      deps
    );
    expect(playSound).toHaveBeenCalledOnce();
    expect(setTitle).toHaveBeenCalledWith("Focus done");
  });

  it("visual always accompanies sound when sound is on", () => {
    const plan = fireAlert(
      {
        settings: { sound: true, notifications: false },
        hasCompletedBlock: true,
        title: "Break over",
        body: "ok",
      },
      deps
    );
    expect(plan.playSound).toBe(true);
    expect(plan.changeTitle).toBe(true);
    expect(playSound).toHaveBeenCalledOnce();
    expect(setTitle).toHaveBeenCalledWith("Break over");
  });
});

describe("completed-block flag", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts false and becomes true after markBlockCompleted", () => {
    expect(readHasCompletedBlock()).toBe(false);
    markBlockCompleted();
    expect(readHasCompletedBlock()).toBe(true);
  });
});
