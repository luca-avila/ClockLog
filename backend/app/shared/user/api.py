# Tempo — a Pomodoro timer and weekly planner
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

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core import ratelimit
from app.core.db import DBSession
from app.core.security import decode_access_token
from app.shared.user.schemas import TokenResponse, UserCreate, UserLogin, UserResponse
from app.shared.user.service import (
    authenticate_user,
    create_user,
    get_current_user,
    user_count,
)

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


async def _rate_limited(request: Request, _: None = None) -> None:
    # Keyed per endpoint + IP: register attempts must not lock out login.
    key = f"{request.url.path}:{ratelimit.client_ip(request)}"
    if ratelimit.check(key):
        return
    raise HTTPException(
        status_code=429,
        detail={"code": "RATE_LIMITED", "message": "Too many attempts, slow down"},
        headers={"Retry-After": str(ratelimit.retry_after(key))},
    )


async def get_current_user_dependency(
    db: DBSession,
    credentials: HTTPAuthorizationCredentials = Depends(security),  # noqa: B008
) -> UserResponse:
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
        ) from e
    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Token missing subject"},
        )
    return await get_current_user(db, email)


@router.post(
    "/register", response_model=UserResponse, status_code=201, dependencies=[Depends(_rate_limited)]
)
async def register(db: DBSession, data: UserCreate):
    # Single-user, self-hosted: once the owner exists, the door is closed —
    # otherwise any visitor to the VPS could create an account. Instance
    # policy lives at the endpoint; the service stays a plain factory.
    if await user_count(db) > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "REGISTRATION_CLOSED",
                "message": "This instance already has an account",
            },
        )
    user = await create_user(db, data)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_rate_limited)])
async def login(db: DBSession, data: UserLogin):
    return await authenticate_user(db, data)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user_dependency)):  # noqa: B008
    return current_user
