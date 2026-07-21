#!/usr/bin/env bash
# Manual deploy script — run ON THE VPS from /opt/poker-app.
#
# Mirrors the safety checks ReRaise's own .github/workflows/deploy.yml
# performs (see /opt/reraise), just invoked by hand instead of from CI:
# fast-forward-only pull, rebuild, recreate only the app container, wait for
# running+healthy, smoke-test /api/health. Never touches poker-clock-db,
# re-raise, poker-clock, or any Docker network/volume it doesn't own.
set -Eeuo pipefail

cd "$(dirname "$0")/.."

echo "== Syncing repo =="
git fetch origin main
git checkout main
git pull --ff-only origin main
echo "HEAD: $(git rev-parse HEAD)"

echo "== Building image =="
docker compose build app

echo "== Recreating app container only =="
docker compose up -d --no-deps app

echo "== Waiting for running+healthy =="
CONTAINER_ID="$(docker compose ps -q app)"
DEPLOY_TIMEOUT=120
INTERVAL=5
ELAPSED=0
while true; do
  STATUS="$(docker inspect "$CONTAINER_ID" --format '{{.State.Status}}')"
  HEALTH="$(docker inspect "$CONTAINER_ID" --format '{{.State.Health.Status}}')"

  if [ "$STATUS" = "exited" ] || [ "$STATUS" = "dead" ]; then
    echo "Container entered terminal state '$STATUS'." >&2
    docker compose logs --tail 200 app
    exit 1
  fi
  if [ "$HEALTH" = "unhealthy" ]; then
    echo "Container reported unhealthy." >&2
    docker compose logs --tail 200 app
    exit 1
  fi
  if [ "$STATUS" = "running" ] && [ "$HEALTH" = "healthy" ]; then
    echo "Container is running and healthy after ${ELAPSED}s."
    break
  fi
  if [ "$ELAPSED" -ge "$DEPLOY_TIMEOUT" ]; then
    echo "Timed out after ${DEPLOY_TIMEOUT}s (status=$STATUS health=$HEALTH)." >&2
    docker compose logs --tail 200 app
    exit 1
  fi
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "== Smoke test (loopback — no public domain yet) =="
curl --fail --silent --show-error http://127.0.0.1:3003/api/health
echo ""

echo "== Pruning dangling images =="
docker image prune -f

echo "Deploy complete."
