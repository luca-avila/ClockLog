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

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.shared.setting.api import router as setting_router
from app.shared.tag.api import router as tag_router
from app.shared.user.api import router as user_router
from app.timer.api import router as timer_router

app = FastAPI(title="Tempo")

app.include_router(user_router)
app.include_router(tag_router)
app.include_router(timer_router)
app.include_router(setting_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "ERROR", "message": str(detail)},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
