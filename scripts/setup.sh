#!/usr/bin/env bash
# First run on a fresh clone: .env with secrets, deps, Postgres + Redis, migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|BETTER_AUTH_SECRET=change-me|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|; s|INTERNAL_API_KEY=change-me|INTERNAL_API_KEY=$(openssl rand -hex 24)|; s|COLLAB_JWT_SECRET=change-me|COLLAB_JWT_SECRET=$(openssl rand -hex 32)|" .env
  echo "Created .env with fresh secrets"
fi
for a in apps/*/; do ln -sf ../../.env "$a.env"; done

npm ci --no-audit --no-fund
(cd services && uv sync --all-packages)
docker compose up -d --wait postgres redis
npm run db:migrate
echo "Setup done. Run: make dev"
