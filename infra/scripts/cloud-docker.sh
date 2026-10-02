#!/bin/bash
# Starts Docker inside a Claude Code cloud container and pulls the local service
# images through Google's Docker Hub mirror (Docker Hub rate-limits anonymous pulls).
# Then run `pnpm services:up` from the repository root.
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

COMPOSE_FILE="$(cd "$(dirname "$0")/../compose" && pwd)/compose.yaml"
for image in $(docker compose -f "$COMPOSE_FILE" config --images); do
  if docker image inspect "$image" >/dev/null 2>&1; then
    continue
  fi
  case "$image" in
    ghcr.io/*) docker pull -q "$image" ;;
    *) docker pull -q "mirror.gcr.io/$image" && docker tag "mirror.gcr.io/$image" "$image" ;;
  esac
done

echo "Docker is ready. Run: pnpm services:up"
