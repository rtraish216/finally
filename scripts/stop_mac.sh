#!/usr/bin/env bash
# Stop and remove the FinAlly container (macOS/Linux). The data volume is kept.
# Idempotent: does nothing if the container does not exist.
set -euo pipefail

CONTAINER="finally"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker rm -f "$CONTAINER" >/dev/null
  echo "Stopped and removed container '$CONTAINER' (volume 'finally-data' preserved)."
else
  echo "Container '$CONTAINER' is not running."
fi
