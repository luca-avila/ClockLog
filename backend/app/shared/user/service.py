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
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_user_token,
    get_password_hash,
    hash_email_token,
    verify_password,
)
from app.shared.user.models import EmailToken, User
from app.shared.user.schemas import TokenResponse, UserCreate, UserLogin, UserResponse

VERIFY = "verify"
RESET = "reset"

# Runs bcrypt on login even for an unknown email, so failure timing does not
# reveal whether an address is registered. Computed once at import.
_DUMMY_HASH = get_password_hash("clocklog-dummy-password")

_TOKEN_ERROR_MESSAGE = "This link is invalid or has expired"


def normalize_email(email: str) -> str:
    return email.strip().lower()


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
    return TokenResponse(access_token=create_user_token(user.id, user.password_changed_at))


async def get_current_user(db: AsyncSession, payload: dict) -> UserResponse:
    raw_sub = payload.get("sub")
    try:
        user_id = uuid.UUID(raw_sub)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid token subject"},
        ) from None
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
        )
    # Same truncation the claim was written with (int seconds) — comparing
    # raw datetimes would log everyone out on every request.
    if payload.get("pwd") != int(user.password_changed_at.timestamp()):
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_REVOKED", "message": "Session no longer valid"},
        )
    return UserResponse.model_validate(user)


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
    result = await db.execute(
        select(EmailToken).where(EmailToken.token_hash == hash_email_token(raw))
    )
    token = result.scalar_one_or_none()
    if (
        token is None
        or token.purpose != purpose
        or token.used_at is not None
        or token.expires_at <= datetime.now(UTC)
    ):
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": _TOKEN_ERROR_MESSAGE},
        )
    token.used_at = datetime.now(UTC)
    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": _TOKEN_ERROR_MESSAGE},
        )
    return user
