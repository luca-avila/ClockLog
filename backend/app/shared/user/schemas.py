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
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def normalize_email(email: str) -> str:
    # Canonical mailbox form, owned by the user module: storage, lookups and
    # per-address rate-limit keys must all spell the same address the same
    # way. It lives here, not in core/ratelimit — core carries no business
    # logic, and the limiter keys on whatever string it is handed.
    return email.strip().lower()


def _reject_over_72_bytes(password: str) -> str:
    # bcrypt silently truncates past 72 bytes; accepting half a password is
    # worse than rejecting it.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def _canonical(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        return _reject_over_72_bytes(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)  # validated against stored hash, no need for 8

    @field_validator("email")
    @classmethod
    def _canonical(cls, v: str) -> str:
        return normalize_email(v)


class EmailRequest(BaseModel):
    """resend-verification and forgot-password: only ever an address."""

    email: EmailStr

    @field_validator("email")
    @classmethod
    def _canonical(cls, v: str) -> str:
        return normalize_email(v)


class TokenSubmit(BaseModel):
    token: str = Field(min_length=1)


class PasswordReset(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        return _reject_over_72_bytes(v)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    email_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
