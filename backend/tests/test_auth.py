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

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from httpx import Headers
from jose import JWTError

from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    hash_email_token,
    verify_password,
)
from app.shared.user.models import EmailToken
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user, get_user_by_email
from app.shared.user.session import issue_session_token, resolve_session_user


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
    async def test_no_token_returns_401(self, client):
        response = await client.get("/auth/me")
        assert response.status_code == 401

    async def test_valid_token_returns_200(self, client, verified_user):
        headers, email = await verified_user()
        response = await client.get("/auth/me", headers=Headers(headers))
        assert response.status_code == 200
        assert response.json()["email"] == email


class TestErrorFormat:
    async def test_error_has_code_field(self, client):
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

    @pytest.mark.asyncio
    async def test_duplicate_race_returns_409_not_500(self, client, monkeypatch, mail_outbox):
        """Both requests pass the SELECT (simulated: the check is made to
        miss) and the loser hits the unique constraint at flush — it must
        surface as the same 409, never a 500."""
        email = f"race-{uuid.uuid4()}@example.com"
        first = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert first.status_code == 201

        async def _miss(db, _email):
            return None

        monkeypatch.setattr("app.shared.user.service.get_user_by_email", _miss)
        loser = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert loser.status_code == 409
        assert loser.json()["code"] == "EMAIL_EXISTS"


class TestVerificationGate:
    async def test_unverified_login_is_403_then_verify_then_login_200(self, client, mail_outbox):
        email = f"gate-{uuid.uuid4()}@example.com"
        reg = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert reg.status_code == 201
        assert "access_token" not in reg.json()

        denied = await client.post("/auth/login", json={"email": email, "password": "secret12"})
        assert denied.status_code == 403
        assert denied.json()["code"] == "EMAIL_NOT_VERIFIED"

        _, _, raw = mail_outbox[-1]
        verified = await client.post("/auth/verify-email", json={"token": raw})
        assert verified.status_code == 200
        assert "access_token" in verified.json()

        allowed = await client.post("/auth/login", json={"email": email, "password": "secret12"})
        assert allowed.status_code == 200

    async def test_register_response_does_not_verify(self, client, mail_outbox):
        email = f"nover-{uuid.uuid4()}@example.com"
        reg = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert reg.json()["email_verified"] is False


class TestEmailTokenLifecycle:
    async def test_expired_used_wrong_purpose_and_unknown_all_answer_alike(
        self, client, verified_user, mail_outbox, db_session
    ):
        _, email = await verified_user()

        # Expired: a verify token whose expiry is already past.
        expired_raw = "expired-raw-token"
        db_session.add(
            EmailToken(
                user_id=(await get_user_by_email(db_session, email)).id,
                token_hash=hash_email_token(expired_raw),
                purpose="verify",
                expires_at=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
        await db_session.commit()

        # Used: burn a fresh one via resend.
        await client.post("/auth/resend-verification", json={"email": email})
        _, _, used_raw = mail_outbox[-1]

        # Wrong purpose: a reset token submitted to /verify-email.
        await client.post("/auth/forgot-password", json={"email": email})
        _, purpose_raw, reset_raw = mail_outbox[-1]
        assert purpose_raw == "reset"

        responses = [
            await client.post("/auth/verify-email", json={"token": expired_raw}),
            await client.post("/auth/verify-email", json={"token": used_raw}),
            await client.post("/auth/verify-email", json={"token": reset_raw}),
            await client.post("/auth/verify-email", json={"token": "never-existed"}),
        ]
        codes = {(r.status_code, r.json()["code"]) for r in responses}
        assert codes == {(400, "INVALID_VERIFICATION_TOKEN")}

    async def test_reissue_invalidates_previous_token(self, client, mail_outbox):
        email = f"reissue-{uuid.uuid4()}@example.com"
        reg = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert reg.status_code == 201
        _, _, first = mail_outbox[-1]

        await client.post("/auth/resend-verification", json={"email": email})
        _, _, second = mail_outbox[-1]
        assert first != second

        stale = await client.post("/auth/verify-email", json={"token": first})
        assert stale.status_code == 400
        fresh = await client.post("/auth/verify-email", json={"token": second})
        assert fresh.status_code == 200

    async def test_concurrent_submit_consumes_exactly_once(self, client, mail_outbox):
        email = f"race-{uuid.uuid4()}@example.com"
        reg = await client.post("/auth/register", json={"email": email, "password": "secret12"})
        assert reg.status_code == 201
        _, _, raw = mail_outbox[-1]
        results = await asyncio.gather(
            client.post("/auth/verify-email", json={"token": raw}),
            client.post("/auth/verify-email", json={"token": raw}),
        )
        statuses = sorted(r.status_code for r in results)
        assert statuses == [200, 400]
        rejected = next(r for r in results if r.status_code == 400)
        assert rejected.json()["code"] == "INVALID_VERIFICATION_TOKEN"


class TestSessionRevocation:
    async def test_token_before_reset_is_revoked(
        self, client, verified_user, auth_headers, mail_outbox, db_session
    ):
        _, email = await verified_user()

        # Pin the password generation to a past instant: a reset running in
        # the same second as the login would otherwise produce the same
        # truncated timestamp and the revocation would be invisible. Login
        # reads the pinned value back, so the token it issues matches it.
        user = await get_user_by_email(db_session, email)
        user.password_changed_at = datetime.now(UTC) - timedelta(hours=1)
        await db_session.commit()

        login = await client.post("/auth/login", json={"email": email, "password": "secret12"})
        assert login.status_code == 200
        old_token = login.json()["access_token"]

        before = await client.get("/auth/me", headers=auth_headers(old_token))
        assert before.status_code == 200

        await client.post("/auth/forgot-password", json={"email": email})
        _, _, reset_raw = mail_outbox[-1]
        reset = await client.post(
            "/auth/reset-password", json={"token": reset_raw, "password": "nuevaclave1"}
        )
        assert reset.status_code == 204

        me = await client.get("/auth/me", headers=auth_headers(old_token))
        assert me.status_code == 401
        assert me.json()["code"] == "TOKEN_REVOKED"

    async def test_pwd_claim_round_trips_through_microseconds(self, db_session):
        """int(timestamp()) truncates; issue and resolve must truncate
        identically or every request logs the user out. A microsecond-bearing
        timestamp is the case that would catch the mismatch."""
        email = f"micro-{uuid.uuid4()}@example.com"
        user = await create_user(db_session, UserCreate(email=email, password="secret12"))
        user.password_changed_at = datetime.now(UTC)  # carries microseconds
        await db_session.commit()

        token = issue_session_token(user.id, user.password_changed_at)
        resolved = await resolve_session_user(db_session, token)
        assert resolved.id == user.id

        # Move password_changed_at to the previous second: the same token is
        # now rejected. Exactly one second apart, so no truncation flake.
        user.password_changed_at = user.password_changed_at - timedelta(seconds=1)
        await db_session.commit()
        with pytest.raises(HTTPException):
            await resolve_session_user(db_session, token)

    async def test_non_string_sub_is_401_invalid_token_not_500(self, db_session):
        # jose 3.x rejects a non-string sub at decode time (JWTClaimsError), so
        # this test patches the decode to feed the guard: a decode that ever skips
        # that validation must still map a garbage subject to 401, never a 500.
        with patch(
            "app.shared.user.session.decode_access_token",
            return_value={"sub": 5, "pwd": 0},
        ):
            with pytest.raises(HTTPException) as exc:
                await resolve_session_user(db_session, "not-a-real-token")
        assert exc.value.status_code == 401
        assert exc.value.detail["code"] == "INVALID_TOKEN"


class TestNoEnumeration:
    async def test_forgot_password_unknown_address_is_204_and_sends_nothing(
        self, client, mail_outbox
    ):
        res = await client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
        assert res.status_code == 204
        assert mail_outbox == []

    async def test_resend_unknown_address_is_204_and_sends_nothing(self, client, mail_outbox):
        res = await client.post("/auth/resend-verification", json={"email": "ghost@example.com"})
        assert res.status_code == 204
        assert mail_outbox == []

    async def test_resend_verified_address_sends_nothing(self, client, verified_user, mail_outbox):
        _, email = await verified_user()
        mail_outbox.clear()
        res = await client.post("/auth/resend-verification", json={"email": email})
        assert res.status_code == 204
        assert mail_outbox == []


class TestEmailRateLimit:
    async def test_per_email_limit_is_independent_of_ip(self, client, verified_user, mail_outbox):
        """The same mailbox exhausts its own budget from many IPs, while a
        different mailbox from the same IP is untouched."""
        _, email = await verified_user()
        mail_outbox.clear()

        # auth_email_rate_limit is 3; the register call already spent one
        # from this IP but the per-email key counts resend calls only.
        for i in range(3):
            res = await client.post(
                "/auth/resend-verification",
                json={"email": email},
                headers={"X-Forwarded-For": f"10.0.0.{i}"},
            )
            assert res.status_code == 204, f"call {i} should pass"
        blocked = await client.post(
            "/auth/resend-verification",
            json={"email": email},
            headers={"X-Forwarded-For": "10.0.0.99"},
        )
        assert blocked.status_code == 429
        assert blocked.json()["code"] == "RATE_LIMITED"

        # A different mailbox, same IP as the blocked one: fine.
        other = await client.post(
            "/auth/resend-verification",
            json={"email": f"other-{uuid.uuid4()}@example.com"},
            headers={"X-Forwarded-For": "10.0.0.99"},
        )
        assert other.status_code == 204


class TestPasswordLength:
    async def test_73_byte_password_is_422(self, client):
        res = await client.post(
            "/auth/register",
            json={"email": f"long-{uuid.uuid4()}@example.com", "password": "a" * 73},
        )
        assert res.status_code == 422

    async def test_72_byte_password_is_accepted(self, client, mail_outbox):
        res = await client.post(
            "/auth/register",
            json={
                "email": f"exact-{uuid.uuid4()}@example.com",
                "password": "a" * 72,
            },
        )
        assert res.status_code == 201
