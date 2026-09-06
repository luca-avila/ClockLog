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
    Request,
)

from app.core import ratelimit
from app.core.db import DBSession
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
    register_user,
    request_password_reset,
    resend_user_verification,
    reset_user_password,
    verify_user_email,
)
from app.shared.user.session import current_user_dependency

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    dependencies=[Depends(ratelimit.ip_guard)],
)
async def register(db: DBSession, data: UserCreate, background: BackgroundTasks, request: Request):
    await ratelimit.email_guard(request, data.email)
    return await register_user(db, background, data)


@router.post(
    "/verify-email", response_model=TokenResponse, dependencies=[Depends(ratelimit.ip_guard)]
)
async def verify_email(db: DBSession, data: TokenSubmit):
    return await verify_user_email(db, data)


@router.post("/resend-verification", status_code=204, dependencies=[Depends(ratelimit.ip_guard)])
async def resend_verification(
    db: DBSession, data: EmailRequest, background: BackgroundTasks, request: Request
):
    await ratelimit.email_guard(request, data.email)
    await resend_user_verification(db, background, data)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(ratelimit.ip_guard)])
async def login(db: DBSession, data: UserLogin):
    return await authenticate_user(db, data)


@router.post("/forgot-password", status_code=204, dependencies=[Depends(ratelimit.ip_guard)])
async def forgot_password(
    db: DBSession, data: EmailRequest, background: BackgroundTasks, request: Request
):
    await ratelimit.email_guard(request, data.email)
    await request_password_reset(db, background, data)


@router.post("/reset-password", status_code=204, dependencies=[Depends(ratelimit.ip_guard)])
async def reset_password(db: DBSession, data: PasswordReset):
    await reset_user_password(db, data)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(current_user_dependency)):  # noqa: B008
    return current_user
