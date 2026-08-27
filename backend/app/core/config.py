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

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    database_url: str
    secret_key: str
    login_rate_limit: int = 10
    login_rate_window_seconds: float = 60
    # Comma-separated origins allowed to call the API. Dev is the Next
    # default port; prod sets this to the nginx-served origin.
    cors_origins: str = "http://localhost:3000"
    # Tests DELETE from every table — this must never be the dev DB. The
    # conftest enforces the *_test suffix; deriving the default keeps the
    # documented `docker compose exec backend pytest` working unchanged.
    test_database_url: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_test_database_url(self) -> str:
        url = self.test_database_url
        if url:
            return url
        # Derive from the dev URL: same server, a *_test database.
        return self.database_url.rstrip("/").rsplit("/", 1)[0] + "/clocklog_test"


settings = Settings()
