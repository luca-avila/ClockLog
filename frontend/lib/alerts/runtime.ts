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

import {
  planAlert,
  type AlertContext,
  type AlertPlan,
  type NotificationPermissionState,
} from "./plan";

const COMPLETED_KEY = "tempo_has_completed_block";
const TITLE_FLASH_MS = 5000;
const DEFAULT_TITLE = "Tempo";

export interface AlertDeps {
  getPermission: () => NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
  showNotification: (title: string, body: string) => void;
  playSound: () => void;
  setTitle: (title: string) => void;
  getTitle: () => string;
  now: () => number;
}

export function readHasCompletedBlock(
  storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBlockCompleted(
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null
): void {
  if (!storage) return;
  try {
    storage.setItem(COMPLETED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function browserPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

function defaultPlaySound(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* autoplay policy or missing Web Audio — degrade silently */
  }
}

function defaultShowNotification(title: string, body: string): void {
  try {
    new Notification(title, { body, silent: true });
  } catch {
    /* unsupported or denied mid-flight */
  }
}

export function createBrowserDeps(): AlertDeps {
  return {
    getPermission: browserPermission,
    requestPermission: async () => {
      if (typeof Notification === "undefined") return "unsupported";
      try {
        const result = await Notification.requestPermission();
        return result as NotificationPermissionState;
      } catch {
        return "unsupported";
      }
    },
    showNotification: defaultShowNotification,
    playSound: defaultPlaySound,
    setTitle: (t) => {
      if (typeof document !== "undefined") document.title = t;
    },
    getTitle: () =>
      typeof document !== "undefined" ? document.title : DEFAULT_TITLE,
    now: () => Date.now(),
  };
}

export interface FireAlertInput {
  settings: AlertContext["settings"];
  hasCompletedBlock: boolean;
  title: string;
  body: string;
}

/**
 * Execute an alert plan. Never throws; each channel fails independently.
 * Does not block on permission — request is fire-and-forget.
 */
export function fireAlert(
  input: FireAlertInput,
  deps: AlertDeps,
  plan: AlertPlan = planAlert({
    settings: input.settings,
    permission: deps.getPermission(),
    hasCompletedBlock: input.hasCompletedBlock,
  })
): AlertPlan {
  if (plan.playSound) {
    try {
      deps.playSound();
    } catch {
      /* channel degraded */
    }
  }

  if (plan.showNotification) {
    try {
      deps.showNotification(input.title, input.body);
    } catch {
      /* channel degraded */
    }
  }

  if (plan.changeTitle) {
    try {
      const previous = deps.getTitle();
      deps.setTitle(input.title);
      const started = deps.now();
      const restore = () => {
        if (deps.now() - started >= TITLE_FLASH_MS - 50) {
          deps.setTitle(previous === input.title ? DEFAULT_TITLE : previous);
        }
      };
      if (typeof window !== "undefined") {
        window.setTimeout(restore, TITLE_FLASH_MS);
      }
    } catch {
      /* channel degraded */
    }
  }

  if (plan.requestPermission) {
    void deps.requestPermission().catch(() => {
      /* never block */
    });
  }

  return plan;
}

export { planAlert };
export type { AlertContext, AlertPlan, NotificationPermissionState };
