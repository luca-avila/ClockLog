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

import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# Imported as a module so tests can patch email_sender.send_* — a
# `from ... import send_verification_email` binding would freeze the
# function and silently defeat the mail_outbox fixture.
from app.core import email as email_sender
from app.core.config import settings
from app.core.ratelimit import normalize_email
from app.core.security import (
    get_password_hash,
    hash_email_token,
    verify_password,
)
from app.shared.user.models import EmailToken, User
from app.shared.user.schemas import (
    EmailRequest,
    PasswordReset,
    TokenResponse,
    TokenSubmit,
    UserCreate,
    UserLogin,
)
from app.shared.user.session import issue_session_token

VERIFY = "verify"
RESET = "reset"

# Runs bcrypt on login even for an unknown email, so failure timing does not
# reveal whether an address is registered. Computed once at import.
_DUMMY_HASH = get_password_hash("clocklog-dummy-password")

_TOKEN_ERROR_MESSAGE = "This link is invalid or has expired"


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    email = normalize_email(data.email)
    existing = await get_user_by_email(db, email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_EXISTS", "message": "Email already registered"},
        )
    # email_verified_at stays NULL: the address is not theirs until the
    # emailed link comes back.
    user = User(email=email, hashed_password=get_password_hash(data.password))
    db.add(user)
    try:
        # Flush here, not at the caller's commit: two concurrent sign-ups
        # with the same address both pass the check above, and the loser
        # must meet the unique constraint as this same 409, not a 500.
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_EXISTS", "message": "Email already registered"},
        ) from None
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == normalize_email(email)))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, data: UserLogin) -> TokenResponse:
    user = await get_user_by_email(db, data.email)
    # bcrypt runs either way: response time must not be an oracle for
    # whether an address is registered.
    ok = verify_password(data.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
        )
    if user.email_verified_at is None:
        # Verification is a gate, not a reminder: a recovery flow is only as
        # trustworthy as the address it mails.
        raise HTTPException(
            status_code=403,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Verify your email address first"},
        )
    return TokenResponse(access_token=issue_session_token(user.id, user.password_changed_at))


async def issue_email_token(db: AsyncSession, user: User, purpose: str) -> str:
    """Returns the RAW token — it goes in the mail and nowhere else.

    Previously issued unused tokens of the same purpose are burned: a
    re-sent link must not be raceable with an older one.
    """
    await db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=datetime.now(UTC))
    )
    raw = secrets.token_urlsafe(32)
    ttl = (
        settings.verification_token_ttl_hours
        if purpose == VERIFY
        else settings.reset_token_ttl_hours
    )
    db.add(
        EmailToken(
            user_id=user.id,
            token_hash=hash_email_token(raw),
            purpose=purpose,
            expires_at=datetime.now(UTC) + timedelta(hours=ttl),
        )
    )
    return raw


async def consume_email_token(db: AsyncSession, raw: str, purpose: str, code: str) -> User:
    """Unknown token / wrong purpose / expired / already used all raise the
    SAME error — the response must not help an attacker distinguish them."""
    now = datetime.now(UTC)
    # One conditional UPDATE, not SELECT-then-mark: under READ COMMITTED
    # the row lock serializes concurrent submits of the same link, and the
    # loser's WHERE re-check finds used_at already set.
    result = await db.execute(
        update(EmailToken)
        .execution_options(synchronize_session=False)
        .where(
            EmailToken.token_hash == hash_email_token(raw),
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(EmailToken.user_id)
    )
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": _TOKEN_ERROR_MESSAGE},
        )
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": _TOKEN_ERROR_MESSAGE},
        )
    return user


async def _issue_mail_token(
    db: AsyncSession,
    background: BackgroundTasks,
    user: User,
    purpose: str,
    send: Callable[[str, str], Awaitable[None]],
) -> str:
    """Issue a token, COMMIT, then enqueue the mail — in that order, here only."""
    raw = await issue_email_token(db, user, purpose)
    # Commit BEFORE enqueueing: the request session closes on response, so the
    # background task only ever receives plain strings, never the session.
    await db.commit()
    background.add_task(send, user.email, raw)
    return raw


async def register_user(db: AsyncSession, background: BackgroundTasks, data: UserCreate) -> User:
    user = await create_user(db, data)
    await _issue_mail_token(db, background, user, VERIFY, email_sender.send_verification_email)
    # expire_on_commit=False keeps the object serializable after the commit
    # above; refresh anyway for identical behavior, the boring solution.
    await db.refresh(user)
    return user


async def verify_user_email(db: AsyncSession, data: TokenSubmit) -> TokenResponse:
    user = await consume_email_token(db, data.token, VERIFY, "INVALID_VERIFICATION_TOKEN")
    # Verifying IS signing in: the address is proven, issue the session here
    # so the emailed link lands the user directly in the app.
    user.email_verified_at = datetime.now(UTC)
    await db.commit()
    return TokenResponse(access_token=issue_session_token(user.id, user.password_changed_at))


async def resend_user_verification(
    db: AsyncSession, background: BackgroundTasks, data: EmailRequest
) -> None:
    user = await get_user_by_email(db, data.email)
    # 204 either way — the RESPONSE must not reveal whether an address is
    # registered (or already verified). Timing is not flattened: this branch
    # does one extra insert+commit; accepted residual, see docs/architecture.md.
    if user and user.email_verified_at is None:
        await _issue_mail_token(db, background, user, VERIFY, email_sender.send_verification_email)


async def request_password_reset(
    db: AsyncSession, background: BackgroundTasks, data: EmailRequest
) -> None:
    user = await get_user_by_email(db, data.email)
    # 204 either way — no enumeration via the response; the timing note
    # lives in docs/architecture.md.
    if user:
        await _issue_mail_token(db, background, user, RESET, email_sender.send_reset_email)


async def reset_user_password(db: AsyncSession, data: PasswordReset) -> None:
    user = await consume_email_token(db, data.token, RESET, "INVALID_RESET_TOKEN")
    user.hashed_password = get_password_hash(data.password)
    # Moving this timestamp is what revokes every live session (the `pwd`
    # claim) — the point of resetting through a mailed link.
    user.password_changed_at = datetime.now(UTC)
    if user.email_verified_at is None:
        # The reset link reached the mailbox, so the address is theirs.
        user.email_verified_at = datetime.now(UTC)
    await db.commit()
