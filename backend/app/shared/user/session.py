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

"""The session seam: issuing a session and resolving one.

Every fact about the wire shape of a session — the claim names, the
seconds-truncation of the password-generation stamp, which garbage maps to
which 401 — lives here and nowhere else. `core/security.py` stays a bag of
generic JWT primitives; routers depend on `current_user_dependency` and
never learn a claim name.
"""

from datetime import datetime
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import DBSession
from app.core.security import create_access_token, decode_access_token
from app.shared.user.models import User
from app.shared.user.schemas import UserResponse

_bearer = HTTPBearer()


def _pwd_stamp(password_changed_at: datetime) -> int:
    # int(...timestamp()) truncates to seconds. Emission and comparison both
    # go through this one function: comparing raw datetimes, or truncating
    # on only one side, logs every user out on every request.
    return int(password_changed_at.timestamp())


def issue_session_token(user_id: UUID, password_changed_at: datetime) -> str:
    """Session token. The `pwd` claim pins the password generation: moving
    password_changed_at invalidates everything issued before it."""
    return create_access_token({"sub": str(user_id), "pwd": _pwd_stamp(password_changed_at)})


async def resolve_session_user(db: AsyncSession, token: str) -> UserResponse:
    try:
        payload = decode_access_token(token)
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
        ) from e
    raw_sub = payload.get("sub")
    if not isinstance(raw_sub, str):
        # jose roundtrips any JSON type in a claim; UUID(5) dies with an
        # AttributeError (.replace), not the caught TypeError — a 500.
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid token subject"},
        )
    try:
        user_id = UUID(raw_sub)
    except ValueError:
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
    if payload.get("pwd") != _pwd_stamp(user.password_changed_at):
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_REVOKED", "message": "Session no longer valid"},
        )
    return UserResponse.model_validate(user)


async def current_user_dependency(
    db: DBSession,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),  # noqa: B008
) -> UserResponse:
    return await resolve_session_user(db, credentials.credentials)
