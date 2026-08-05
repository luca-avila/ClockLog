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

import ast
import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent / "app"
TIMER_DIR = APP_ROOT / "timer"
PLAN_DIR = APP_ROOT / "plan"
SHARED_DIR = APP_ROOT / "shared"

TIMER_POMODORO_WORDS = re.compile(
    r"\b(block|focus|cycle|pomodoro)\b", re.IGNORECASE
)


def _get_python_files(directory: Path) -> list[Path]:
    return sorted(p for p in directory.rglob("*.py") if p.stem != "__init__")


def _imports_in_file(path: Path) -> list[str]:
    """Return all imported module paths from a file."""
    tree = ast.parse(path.read_text())
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append(node.module)
    return imports


def test_timer_does_not_import_plan():
    """No file under backend/app/timer/ imports app.plan (invariant 11)."""
    violations = []
    for f in _get_python_files(TIMER_DIR):
        for imp in _imports_in_file(f):
            if imp.startswith("app.plan") or imp.startswith("plan."):
                violations.append(f"{f.relative_to(APP_ROOT)} imports {imp}")
    assert not violations, "timer/ must never import plan/:\n" + "\n".join(violations)


def test_plan_does_not_import_timer():
    """No file under backend/app/plan/ imports app.timer (invariant 11)."""
    violations = []
    for f in _get_python_files(PLAN_DIR):
        for imp in _imports_in_file(f):
            if imp.startswith("app.timer") or imp.startswith("timer."):
                violations.append(f"{f.relative_to(APP_ROOT)} imports {imp}")
    assert not violations, "plan/ must never import timer/:\n" + "\n".join(violations)


def test_plan_contains_no_timer_vocabulary():
    """No file under backend/app/plan/ uses timer/pomodoro vocabulary (invariant 13)."""
    violations = []
    for f in _get_python_files(PLAN_DIR):
        if f.name == "__init__.py":
            continue
        text = f.read_text()
        matches = TIMER_POMODORO_WORDS.findall(text)
        if matches:
            matched = ", ".join(sorted(set(m.lower() for m in matches)))
            violations.append(f"{f.relative_to(APP_ROOT)} contains: {matched}")
    assert not violations, (
        "plan/ must never contain timer vocabulary:\n" + "\n".join(violations)
    )
