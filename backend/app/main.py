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

import importlib
import json
import logging
import traceback
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.shared.setting.api import router as setting_router
from app.shared.tag.api import router as tag_router
from app.shared.user.api import router as user_router

app = FastAPI(title="ClockLog")

# Bearer header, not cookie — credentials stay off so any origin list is
# an explicit allow, never an implicit ambient one.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(user_router)
app.include_router(tag_router)
app.include_router(setting_router)

# Feature modules are deletable (invariant 11): tolerate either one's
# absence instead of hard-importing its router. Shared routers above stay
# mandatory — only timer/ and plan/ are optional parts of the app.
for _module_name in ("app.timer.api", "app.plan.api"):
    try:
        _module = importlib.import_module(_module_name)
    except ModuleNotFoundError:
        continue
    app.include_router(_module.router)

error_log = logging.getLogger("clocklog.errors")
error_log.setLevel(logging.ERROR)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail, headers=exc.headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "ERROR", "message": str(detail)},
        headers=exc.headers,
    )


# The interval contract is one protocol: a payload the engine cannot have
# produced must carry the same code whichever layer catches it. Pydantic field
# errors for `intervals`/`started_at`/`ended_at` on /blocks are therefore
# re-labelled INVALID_INTERVAL; every other route and field keeps FastAPI's own
# 422 body (docs/api.md § Error codes).
_INTERVAL_CONTRACT_FIELDS = ("intervals", "started_at", "ended_at")

# The app's own model validators (BlockUpdate's "cannot be cleared" guard)
# report loc = ("body",) and name the field only in the raised message, so those
# messages are listed explicitly. Pydantic's built-in wording is never pattern
# matched — a library message change must not be able to re-label an error.
_INTERVAL_GUARD_MESSAGES = frozenset({"started_at cannot be cleared"})


def _is_interval_contract_error(request: Request, exc: RequestValidationError) -> bool:
    path = request.url.path
    if path != "/blocks" and not path.startswith("/blocks/"):
        return False
    for error in exc.errors():
        if any(part in _INTERVAL_CONTRACT_FIELDS for part in error.get("loc", ())):
            return True
        guard = (error.get("ctx") or {}).get("error")
        if guard is not None and str(guard) in _INTERVAL_GUARD_MESSAGES:
            return True
    return False


@app.exception_handler(RequestValidationError)
async def interval_validation_exception_handler(request: Request, exc: RequestValidationError):
    if _is_interval_contract_error(request, exc):
        return JSONResponse(
            status_code=422,
            content={
                "code": "INVALID_INTERVAL",
                "message": "intervals must be a non-empty list of ordered, closed, "
                "timezone-aware segments",
            },
        )
    return await request_validation_exception_handler(request, exc)


@app.middleware("http")
async def error_monitoring(request: Request, call_next):
    # Basic error monitoring: request-id correlation + one JSON log line per
    # unhandled exception, greppable in `docker compose logs`.
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    try:
        response = await call_next(request)
    except Exception as exc:
        entry = {
            "event": "unhandled_exception",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "error": repr(exc),
            "traceback": traceback.format_exc(),
        }
        error_log.error(json.dumps(entry))
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL_ERROR",
                "message": "Internal server error",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )
    response.headers.setdefault("X-Request-ID", request_id)
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
