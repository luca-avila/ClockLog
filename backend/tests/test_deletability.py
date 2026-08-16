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
# GNU General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Invariant 11, proven mechanically: either feature module can be deleted
without breaking the other. Runs against a pruned copy of the tree in a
subprocess — the real tree is never touched."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BACKEND_DIR / "app"
TESTS_DIR = BACKEND_DIR / "tests"


def _make_pruned_tree(tmp_path: Path, removed_module: str) -> Path:
    root = tmp_path / "pruned"
    root.mkdir()
    shutil.copytree(APP_DIR, root / "app", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.rmtree(root / "app" / removed_module)
    # pytest config (asyncio_mode=auto lives in pyproject)
    shutil.copy2(BACKEND_DIR / "pyproject.toml", root / "pyproject.toml")
    (root / "tests").mkdir()
    shutil.copy2(TESTS_DIR / "__init__.py", root / "tests" / "__init__.py")
    shutil.copy2(TESTS_DIR / "conftest.py", root / "tests" / "conftest.py")
    return root


def _copy_suite(root: Path, suite: str) -> None:
    shutil.copytree(
        TESTS_DIR / suite, root / "tests" / suite, ignore=shutil.ignore_patterns("__pycache__")
    )


def _run(root: Path, *args: str) -> subprocess.CompletedProcess:
    # Pin the config vars from the live settings instead of trusting
    # os.environ — other tests may have leaked overrides into it.
    from app.core.config import settings

    env = dict(os.environ)
    env["PYTHONPATH"] = str(root)
    env["DATABASE_URL"] = settings.database_url
    env["SECRET_KEY"] = settings.secret_key
    return subprocess.run(
        [sys.executable, *args], cwd=root, env=env, capture_output=True, text=True
    )


def _assert_boots(root: Path, must_have: str, must_not_prefix: str) -> None:
    # openapi() is the version-proof way to enumerate mounted paths —
    # newer FastAPI route wrappers do not expose `.path` directly.
    code = (
        "from app.main import app\n"
        "paths = set(app.openapi()['paths'])\n"
        f"assert {must_have!r} in paths, paths\n"
        f"assert not any(p.startswith({must_not_prefix!r}) for p in paths), paths\n"
        "print('BOOT-OK')\n"
    )
    res = _run(root, "-c", code)
    assert res.returncode == 0, f"boot failed:\n{res.stdout}\n{res.stderr}"


def test_app_boots_and_plan_suite_passes_without_timer(tmp_path):
    root = _make_pruned_tree(tmp_path, "timer")
    _copy_suite(root, "plan")
    _assert_boots(root, "/plan/entries", "/blocks")
    res = _run(root, "-m", "pytest", "tests/plan", "-q")
    assert res.returncode == 0, f"plan suite failed:\n{res.stdout}\n{res.stderr}"


def test_app_boots_and_timer_suite_passes_without_plan(tmp_path):
    root = _make_pruned_tree(tmp_path, "plan")
    _copy_suite(root, "timer")
    _assert_boots(root, "/blocks", "/plan/entries")
    res = _run(root, "-m", "pytest", "tests/timer", "-q")
    assert res.returncode == 0, f"timer suite failed:\n{res.stdout}\n{res.stderr}"
