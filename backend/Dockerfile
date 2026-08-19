FROM python:3.12-slim AS base

WORKDIR /app

COPY pyproject.toml .

# --- dev stage: includes pytest, ruff, httpx for local testing ---
FROM base AS dev
RUN pip install --no-cache-dir -e ".[dev]"
COPY . .

# --- prod stage: runtime deps only, non-root user ---
FROM base AS prod
RUN pip install --no-cache-dir -e .
COPY . .

RUN useradd --create-home appuser
USER appuser

CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
