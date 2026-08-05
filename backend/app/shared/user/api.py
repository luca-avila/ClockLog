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

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.db import DBSession
from app.core.security import decode_access_token
from app.shared.user.schemas import TokenResponse, UserCreate, UserLogin, UserResponse
from app.shared.user.service import authenticate_user, create_user, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


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


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(db: DBSession, data: UserCreate):
    user = await create_user(db, data)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(db: DBSession, data: UserLogin):
    return await authenticate_user(db, data)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user_dependency)):  # noqa: B008
    return current_user
