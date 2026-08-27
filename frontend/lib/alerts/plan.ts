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

/** Browser Notification.permission plus unsupported. */
export type NotificationPermissionState =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

export interface AlertSettings {
  sound: boolean;
  notifications: boolean;
}

export interface AlertContext {
  settings: AlertSettings;
  permission: NotificationPermissionState;
  /** True once the user has finished at least one block (this session or prior). */
  hasCompletedBlock: boolean;
}

/**
 * Pure plan for one alert event (block ended).
 * Channels degrade independently; visual is never omitted when alerting.
 */
export interface AlertPlan {
  playSound: boolean;
  showNotification: boolean;
  /** Always true — visual accompanies sound; sole channel when muted/denied. */
  changeTitle: boolean;
  /**
   * Request Notification permission only after the first completed block,
   * never as a blocking prompt, and only while still "default".
   */
  requestPermission: boolean;
}

export function planAlert(ctx: AlertContext): AlertPlan {
  const { settings, permission, hasCompletedBlock } = ctx;

  const playSound = settings.sound;
  const showNotification =
    settings.notifications && permission === "granted";
  const requestPermission =
    settings.notifications &&
    permission === "default" &&
    hasCompletedBlock;

  return {
    playSound,
    showNotification,
    changeTitle: true,
    requestPermission,
  };
}
