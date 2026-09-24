# syntax=docker/dockerfile:1

# ---- Stage 1: build the Next.js static export -------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /frontend

# Install dependencies first so this layer is cached until the lockfile changes
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
# Static export ends up in /frontend/out

# ---- Stage 2: Python runtime ------------------------------------------------
FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/backend/.venv \
    PATH="/app/backend/.venv/bin:$PATH" \
    FINALLY_DB_PATH=/app/db/finally.db \
    FINALLY_STATIC_DIR=/app/backend/static

WORKDIR /app/backend

# Dependencies first (cached until pyproject.toml / uv.lock change)
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

# Application code, then install the project itself
COPY backend/app ./app
RUN uv sync --frozen --no-dev

# Frontend static export served by FastAPI
COPY --from=frontend-build /frontend/out ./static

# Runtime volume mount point for the SQLite file
RUN mkdir -p /app/db
VOLUME /app/db

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health', timeout=2).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
