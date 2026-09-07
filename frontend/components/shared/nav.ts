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

import type { NavIconName } from "./NavIcon";

export type NavTier = "tab" | "rail" | "rail-foot" | "gear";

export interface NavDestination {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName;
  readonly tiers: readonly NavTier[];
}

// Single registry of navigation destinations (SCR-01). The three primary
// destinations are carried by both surfaces that navigate between screens:
// the mobile tab bar ("tab") and the desktop sidebar rail ("rail").
const DESTINATIONS: readonly NavDestination[] = [
  { href: "/", label: "Timer", icon: "timer", tiers: ["tab", "rail"] },
  { href: "/history", label: "History", icon: "history", tiers: ["tab", "rail"] },
  { href: "/plan", label: "Plan", icon: "plan", tiers: ["tab", "rail"] },
  // Tags live under Settings' Data section (SCR-40), so this tier is about
  // the app rather than about time — it sits at the foot of the rail.
  { href: "/settings#tags", label: "Tags", icon: "tags", tiers: ["rail-foot"] },
  { href: "/settings", label: "Settings", icon: "settings", tiers: ["rail-foot", "gear"] },
];

export function destinationsIn(tier: NavTier): readonly NavDestination[] {
  return DESTINATIONS.filter((d) => d.tiers.includes(tier));
}

export function isActivePath(pathname: string, href: string): boolean {
  // A hash href jumps to a section of another item's page, so it is never
  // a destination of its own — otherwise /settings lights up twice.
  // Sub-routes match only on a "/" segment boundary; / must stay exact.
  if (href.includes("#")) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
