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

import importlib
import json
import logging
import traceback
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.shared.setting.api import router as setting_router
from app.shared.tag.api import router as tag_router
from app.shared.user.api import router as user_router

app = FastAPI(title="Tempo")

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

error_log = logging.getLogger("tempo.errors")
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
