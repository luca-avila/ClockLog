#!/bin/sh
# Tempo — CI check: the canonical commands from CLAUDE.md § Commands.
# test_deletability.py runs as part of the backend suite, so invariant 11's
# deletability proof is a check, not a manual experiment.
set -eu

cd "$(dirname "$0")/.."

echo "== backend: pytest (incl. deletability proof) =="
docker compose exec -T backend pytest

echo "== backend: ruff =="
docker compose exec -T backend ruff check .
docker compose exec -T backend ruff format --check app tests

echo "== frontend: vitest =="
cd frontend && npm run test

echo "== frontend: eslint =="
npm run lint

echo "== frontend: tsc =="
npx tsc --noEmit

echo "ALL CHECKS PASSED"
