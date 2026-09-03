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

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core import ratelimit
from app.core.config import settings
from app.core.db import DBSession
from app.core.security import decode_access_token
from app.shared.user.schemas import (
    EmailRequest,
    PasswordReset,
    TokenResponse,
    TokenSubmit,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.shared.user.service import (
    authenticate_user,
    get_current_user,
    normalize_email,
    register_user,
    request_password_reset,
    resend_user_verification,
    reset_user_password,
    verify_user_email,
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


def _check_email_rate(request: Request, address: str) -> None:
    # Per-address window under separate keys from the per-IP one: one mailbox
    # must not be able to exhaust another's budget, nor its own IP's. Called
    # inside the handler — the body is not available to a Depends without
    # parsing it twice.
    key = f"{request.url.path}:email:{normalize_email(address)}"
    limit, window = settings.auth_email_rate_limit, settings.auth_email_rate_window_seconds
    if ratelimit.check(key, limit, window):
        return
    raise HTTPException(
        status_code=429,
        detail={"code": "RATE_LIMITED", "message": "Too many emails requested, slow down"},
        headers={"Retry-After": str(ratelimit.retry_after(key, window))},
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
    return await get_current_user(db, payload)


@router.post(
    "/register", response_model=UserResponse, status_code=201, dependencies=[Depends(_rate_limited)]
)
async def register(db: DBSession, data: UserCreate, background: BackgroundTasks, request: Request):
    _check_email_rate(request, data.email)
    return await register_user(db, background, data)


@router.post("/verify-email", response_model=TokenResponse, dependencies=[Depends(_rate_limited)])
async def verify_email(db: DBSession, data: TokenSubmit):
    return await verify_user_email(db, data)


@router.post("/resend-verification", status_code=204, dependencies=[Depends(_rate_limited)])
async def resend_verification(
    db: DBSession, data: EmailRequest, background: BackgroundTasks, request: Request
):
    _check_email_rate(request, data.email)
    await resend_user_verification(db, background, data)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_rate_limited)])
async def login(db: DBSession, data: UserLogin):
    return await authenticate_user(db, data)


@router.post("/forgot-password", status_code=204, dependencies=[Depends(_rate_limited)])
async def forgot_password(
    db: DBSession, data: EmailRequest, background: BackgroundTasks, request: Request
):
    _check_email_rate(request, data.email)
    await request_password_reset(db, background, data)


@router.post("/reset-password", status_code=204, dependencies=[Depends(_rate_limited)])
async def reset_password(db: DBSession, data: PasswordReset):
    await reset_user_password(db, data)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user_dependency)):  # noqa: B008
    return current_user
