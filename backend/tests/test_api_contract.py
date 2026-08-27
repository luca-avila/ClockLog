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

"""Every 2xx JSON response in the app must carry a real schema.

Walks the OpenAPI spec and fails if any 200/201 response has an empty
application/json schema — listing every offender by METHOD path -> code.
Skip 204 (no content).

This is the mechanical guard that keeps /docs complete and the wire
contract enforced.  Style matches test_independence.py / test_deletability.py.
"""

from app.main import app


def test_all_json_responses_declared():
    """No 200/201 endpoint may return an untyped JSON response."""
    schema = app.openapi()
    violations: list[str] = []

    for path, methods in schema.get("paths", {}).items():
        for method in ("get", "post", "put", "patch", "delete"):
            operation = methods.get(method)
            if operation is None:
                continue
            responses = operation.get("responses", {})
            for code in ("200", "201"):
                resp = responses.get(code)
                if resp is None:
                    continue
                content = resp.get("content", {})
                # FastAPI emits exactly {} when a route declares no
                # response_model and no return annotation — nothing else
                # produces an empty schema, so this needs no allow-list.
                if not content.get("application/json", {}).get("schema"):
                    violations.append(f"{method.upper()} {path} -> {code}")

    assert not violations, "Endpoints with untyped JSON responses:\n" + "\n".join(violations)
