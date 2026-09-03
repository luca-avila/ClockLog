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

import uuid

from app.core import email as email_sender
from app.shared.user.schemas import EmailRequest, TokenSubmit, UserCreate
from app.shared.user.service import (
    register_user,
    request_password_reset,
    resend_user_verification,
    verify_user_email,
)


class _SpyBackground:
    """Records enqueue calls without executing them — no network, no mail."""

    def __init__(self, order: list):
        self.order = order
        self.tasks: list[tuple] = []

    def add_task(self, fn, *args):
        self.order.append(("enqueue", fn.__name__))
        self.tasks.append((fn, args))


def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}@example.com"


async def _instrument_commit(db_session, order: list):
    real_commit = db_session.commit

    async def commit():
        await real_commit()
        order.append(("commit", ""))

    return commit


async def test_commit_precedes_enqueue_in_every_mail_flow(db_session, monkeypatch):
    order: list[tuple[str, str]] = []
    monkeypatch.setattr(db_session, "commit", await _instrument_commit(db_session, order))
    background = _SpyBackground(order)

    email = _unique_email("pipeline")
    await register_user(db_session, background, UserCreate(email=email, password="longenough1"))
    await resend_user_verification(db_session, background, EmailRequest(email=email))
    await request_password_reset(db_session, background, EmailRequest(email=email))

    assert [step[0] for step in order] == ["commit", "enqueue"] * 3
    # Compare by identity, not __name__: the autouse mail_outbox fixture
    # patches these attributes (renaming them to _verify/_reset).
    fns = [fn for fn, _args in background.tasks]
    assert fns.count(email_sender.send_verification_email) == 2
    assert fns.count(email_sender.send_reset_email) == 1


async def test_no_commit_no_enqueue_for_silent_branches(db_session, monkeypatch):
    order: list[tuple[str, str]] = []
    monkeypatch.setattr(db_session, "commit", await _instrument_commit(db_session, order))

    await resend_user_verification(
        db_session, _SpyBackground(order), EmailRequest(email=_unique_email("ghost-resend"))
    )
    await request_password_reset(
        db_session, _SpyBackground(order), EmailRequest(email=_unique_email("ghost-reset"))
    )

    assert order == []


async def test_resend_on_verified_address_touches_nothing(db_session, monkeypatch):
    # Register through the normal flow, capturing the raw token from the spy.
    setup_order: list = []
    setup_background = _SpyBackground(setup_order)
    email = _unique_email("verified")
    await register_user(
        db_session, setup_background, UserCreate(email=email, password="longenough1")
    )
    _, args = setup_background.tasks[0]
    raw = args[1]
    await verify_user_email(db_session, TokenSubmit(token=raw))

    order: list[tuple[str, str]] = []
    monkeypatch.setattr(db_session, "commit", await _instrument_commit(db_session, order))
    background = _SpyBackground(order)
    await resend_user_verification(db_session, background, EmailRequest(email=email))

    assert order == []
    assert background.tasks == []
