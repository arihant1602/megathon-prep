#!/usr/bin/env bash
# Runs every app and service with hot reload. Ctrl-C stops all of them.
#   kestrel :3001  boli :3002  onboard :3003  margin :3004
#   risk :8001     llm :8002   bhashini :8003 collab :8004
set -uo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0' INT TERM EXIT

run() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  (cd "$dir" && exec "$@") 2>&1 | sed -u "s/^/[$name] /" &
}

run risk     services uv run --package risk uvicorn risk_service.main:app --reload --port 8001
run llm      services uv run --package llm uvicorn llm_service.main:app --reload --port 8002
run bhashini services uv run --package bhashini uvicorn bhashini_service.main:app --reload --port 8003
run collab   services/collab node --watch --env-file=../../.env src/server.ts
run kestrel  apps/kestrel env BETTER_AUTH_URL=http://localhost:3001 npx next dev -p 3001
run boli     apps/boli    env BETTER_AUTH_URL=http://localhost:3002 npx next dev -p 3002
run onboard  apps/onboard env BETTER_AUTH_URL=http://localhost:3003 npx next dev -p 3003
run margin   apps/margin  env BETTER_AUTH_URL=http://localhost:3004 npx next dev -p 3004
wait
