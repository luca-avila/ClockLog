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

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * The single filled neutral-900 button. Every call site that commits an
 * action — START, RESUME, SAVE, SIGN IN — routes through this. It wraps the
 * shadcn Button at a fixed variant and size, and still takes no className:
 * a per-call-site override is how the divergent copies happened before.
 */
export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  "aria-label": ariaLabel,
}: PrimaryButtonProps) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} size="lg">
      {children}
    </Button>
  );
}
