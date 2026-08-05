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

import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text

from app.core.config import Settings


class TestConfig:
    def test_settings_loads_from_env(self):
        os.environ["DATABASE_URL"] = "postgresql://test:test@localhost/test"
        os.environ["SECRET_KEY"] = "test-secret"
        s = Settings()
        assert s.database_url == "postgresql://test:test@localhost/test"
        assert s.secret_key == "test-secret"

    def test_missing_required_var_raises(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.delenv("SECRET_KEY", raising=False)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)

    def test_settings_case_insensitive(self):
        os.environ["database_url"] = "postgresql://test:test@localhost/test"
        os.environ["SECRET_KEY"] = "test-secret"
        s = Settings()
        assert s.database_url == "postgresql://test:test@localhost/test"


@pytest.mark.asyncio
async def test_session_roundtrips(db_session):
    """An async session opens, round-trips a trivial query, and closes."""
    result = await db_session.execute(text("SELECT 1"))
    assert result.scalar() == 1
