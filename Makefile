.PHONY: setup dev infra up down logs migrate db-generate db-studio psql test build lint k8s-up k8s-down railway-plan railway-apply clean

setup:          ## first run: .env, deps, postgres+redis, migrations
	./scripts/setup.sh

dev: infra      ## all 4 apps + 4 services with hot reload (Ctrl-C stops everything)
	./scripts/dev.sh

infra:          ## postgres + redis only
	docker compose up -d --wait postgres redis

up:             ## the whole stack in containers (production builds)
	docker compose --profile app up -d --build

down:
	docker compose --profile app down

logs:
	docker compose --profile app logs -f --tail=100

db-generate:    ## after editing packages/platform/src/db/schema.ts
	npm run db:generate

migrate:
	npm run db:migrate

db-studio:
	npm run studio -w @mega/platform

psql:
	docker compose exec postgres psql -U megathon megathon

test:           ## python tests + typecheck + lint
	cd services && uv run pytest -q
	npm run typecheck
	npm run lint

build:          ## production build of all four apps
	npm run build -w apps/kestrel -w apps/boli -w apps/onboard -w apps/margin

k8s-up:         ## local kind cluster, ingress on http://*.localtest.me:8080
	./scripts/k8s-up.sh

k8s-down:
	kind delete cluster --name megathon

railway-plan:   ## preview Railway changes (needs GITHUB_REPO=owner/repo, railway login + link)
	railway config plan

railway-apply:
	railway config apply

clean:          ## stop containers and delete the DB volume
	docker compose --profile app down -v
