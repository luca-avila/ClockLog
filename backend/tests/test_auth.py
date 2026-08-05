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

import uuid

import pytest
from httpx import ASGITransport, AsyncClient, Headers
from jose import JWTError

from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.main import app
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user, get_user_by_email


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "correct-horse-battery-staple"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self):
        password = "correct-horse-battery-staple"
        hashed = get_password_hash(password)
        assert verify_password("wrong-password", hashed) is False

    def test_different_passwords_produce_different_hashes(self):
        pw1 = get_password_hash("alpha")
        pw2 = get_password_hash("beta")
        assert pw1 != pw2


class TestJWT:
    def test_token_round_trip(self):
        token = create_access_token(data={"sub": "test@example.com"})
        payload = decode_access_token(token)
        assert payload["sub"] == "test@example.com"

    def test_expired_token_is_rejected(self):
        token = create_access_token(
            data={"sub": "test@example.com"},
            expires_delta_seconds=-1,
        )
        with pytest.raises(JWTError):
            decode_access_token(token)

    def test_tampered_token_is_rejected(self):
        token = create_access_token(data={"sub": "test@example.com"})
        # Tamper the payload (middle part) — change a character to invalidate signature
        parts = token.split(".")
        parts[1] = parts[1][:-2] + "XX"
        tampered = ".".join(parts)
        with pytest.raises(JWTError):
            decode_access_token(tampered)


class TestProtectedRoutes:
    @pytest.mark.asyncio
    async def test_no_token_returns_401(self):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/auth/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_valid_token_returns_200(self):
        email = f"auth-test-{uuid.uuid4()}@example.com"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            register_resp = await client.post(
                "/auth/register",
                json={"email": email, "password": "secret12"},
            )
            assert register_resp.status_code == 201

            login_resp = await client.post(
                "/auth/login",
                json={"email": email, "password": "secret12"},
            )
            token = login_resp.json()["access_token"]

            response = await client.get(
                "/auth/me",
                headers=Headers({"Authorization": f"Bearer {token}"}),
            )
        assert response.status_code == 200
        assert response.json()["email"] == email


class TestErrorFormat:
    @pytest.mark.asyncio
    async def test_error_has_code_field(self):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/auth/me")
        assert response.status_code == 401
        body = response.json()
        assert "code" in body


class TestUserService:
    @pytest.mark.asyncio
    async def test_create_and_retrieve_user(self, db_session):
        email = f"alice-{uuid.uuid4()}@example.com"
        await create_user(
            db_session,
            UserCreate(email=email, password="secret12"),
        )
        await db_session.commit()

        retrieved = await get_user_by_email(db_session, email)
        assert retrieved is not None
        assert retrieved.email == email

    @pytest.mark.asyncio
    async def test_duplicate_email_is_rejected(self, db_session):
        from fastapi import HTTPException

        email = f"bob-{uuid.uuid4()}@example.com"
        await create_user(
            db_session,
            UserCreate(email=email, password="secret12"),
        )
        await db_session.commit()

        with pytest.raises(HTTPException):
            await create_user(
                db_session,
                UserCreate(email=email, password="secret12"),
            )
