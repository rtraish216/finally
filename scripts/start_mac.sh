#!/usr/bin/env bash
# Start FinAlly in Docker (macOS/Linux). Idempotent: safe to run repeatedly.
# Usage: scripts/start_mac.sh [--build] [--open]
#   --build  force a rebuild of the image
#   --open   open the app in the default browser once it is up
set -euo pipefail

IMAGE="finally"
CONTAINER="finally"
VOLUME="finally-data"
PORT="${PORT:-8000}"
URL="http://localhost:${PORT}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD=false
OPEN=false
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --open) OPEN=true ;;
    -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

# Build the image if requested or missing
if [ "$BUILD" = true ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image '$IMAGE'..."
  docker build -t "$IMAGE" .
fi

# .env is optional: without it the app still starts (chat returns a friendly error)
ENV_ARGS=()
if [ -f .env ]; then
  ENV_ARGS=(--env-file .env)
else
  echo "Warning: no .env file found. Starting without OPENROUTER_API_KEY;" >&2
  echo "         AI chat will be unavailable (copy .env.example to .env to enable it)." >&2
fi

# Remove any previous container (running or stopped); the volume is kept
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Removing existing container '$CONTAINER'..."
  docker rm -f "$CONTAINER" >/dev/null
fi

docker run -d \
  --name "$CONTAINER" \
  -v "$VOLUME:/app/db" \
  -p "$PORT:8000" \
  ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} \
  "$IMAGE" >/dev/null

# Wait briefly for the health endpoint
printf "Waiting for FinAlly to become ready"
ready=false
for _ in $(seq 1 30); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then ready=true; break; fi
  printf "."
  sleep 1
done
echo

if [ "$ready" = true ]; then
  echo "FinAlly is running at $URL"
else
  echo "Container started but /api/health did not respond within 30s." >&2
  echo "Check logs with: docker logs $CONTAINER" >&2
  echo "Expected URL: $URL"
fi

if [ "$OPEN" = true ]; then
  if command -v open >/dev/null 2>&1; then open "$URL" || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" || true
  else echo "Open $URL in your browser."; fi
fi
