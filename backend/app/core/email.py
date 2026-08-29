# ClockLog — a Pomodoro timer and weekly planner
# Copyright (C) 2024  Luca
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Outbound email via Resend, called as a plain httpx POST — no SDK.

With RESEND_API_KEY empty (dev and CI) nothing is sent: the content is
logged instead, so the verification / reset flow is exercisable end to
end without touching the network.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("clocklog.email")
# Module-level level, like error_log in main.py — otherwise the INFO lines
# never surface in `docker compose logs`.
logger.setLevel(logging.INFO)

RESEND_URL = "https://api.resend.com/emails"


def _body_of(exc: Exception) -> str:
    """Best-effort response body extraction, for the failure log line."""
    response = getattr(exc, "response", None)
    body = getattr(response, "text", None)
    return body if isinstance(body, str) else ""


async def send_email(to: str, subject: str, html: str) -> None:
    # First branch, before building any network object: dev and CI send no
    # mail, they log the content.
    if not settings.resend_api_key:
        logger.info("email (not sent, no RESEND_API_KEY) to=%s subject=%s\n%s", to, subject, html)
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            resp.raise_for_status()
    except Exception as exc:
        # Never propagates: sending runs in the background and must not take
        # down an already-committed request. The runbook greps this message.
        logger.error("email send failed to=%s error=%r body=%s", to, exc, _body_of(exc))


def _link(path: str, token: str) -> str:
    return f"{settings.app_base_url.rstrip('/')}{path}?token={token}"


async def send_verification_email(to: str, token: str) -> None:
    link = _link("/verify-email", token)
    await send_email(
        to,
        "Verify your ClockLog address",
        f"<p>Confirm this address to activate your ClockLog account:</p>"
        f'<p><a href="{link}">Verify email address</a></p>'
        f"<p>The link expires in 24 hours. If you didn't sign up, ignore this email.</p>",
    )


async def send_reset_email(to: str, token: str) -> None:
    link = _link("/reset-password", token)
    await send_email(
        to,
        "Reset your ClockLog password",
        f"<p>Someone asked to reset the password for this address.</p>"
        f'<p><a href="{link}">Reset password</a></p>'
        f"<p>The link expires in 1 hour, and resetting signs out every session. "
        f"If this wasn't you, ignore this email and your password stays as it was.</p>",
    )
