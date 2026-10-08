# Megathon starter: 4 apps, 4 microservices, 1 platform

One template per likely problem-statement type (see `MEGATHON_INFO.md`). Each one is a full product: landing page, auth, Postgres, its own backend services, and Docker/Railway/Kubernetes deploys.

| App | Track | Port | What it does | Backed by |
|---|---|---|---|---|
| **Kestrel** `apps/kestrel` | Finance (Lloyds / Vanguard / Chubb-style) | 3001 | Fraud and churn scoring with exact SHAP reasons, LLM plain-English summaries, a case queue, and training on your own CSV | `risk` → `llm` |
| **Boli** `apps/boli` | Bhashini | 3002 | Voice assistant in 13 Indian languages: speech → English → LLM → back to your language → speech. Domains: farming, health, money, travel | `bhashini` → `llm`, Redis |
| **Onboard** `apps/onboard` | Qualcomm on-device AI | 3003 | Object detection and classification in the browser (Transformers.js in a Web Worker: WebGPU, else WASM). Frames never leave the device | none (in-browser) |
| **Margin** `apps/margin` | Systems (OSDG-style collab editor) | 3004 | Realtime collaborative editor with live cursors, owner/editor/viewer roles, and offline edits that merge on reconnect (Yjs CRDT) | `collab` |

```
                ┌─────────── packages/platform (shared) ───────────┐
                │ better-auth · drizzle schema + migrations · UI   │
                └──────────────────────────────────────────────────┘
 kestrel :3001 ──► risk :8001 (FastAPI, XGBoost+TreeSHAP) ──► llm :8002 (FastAPI, Claude)
 boli    :3002 ──► bhashini :8003 (FastAPI, ULCA/Dhruva) ──► llm :8002          ▲
 onboard :3003    (inference runs in the browser worker)                        │
 margin  :3004 ══► collab :8004 (Hocuspocus WebSocket, JWT per document)        │
       │                    │                                                   │
       └──────── Postgres (one schema, one account works in all 4 apps) ── Redis (Bhashini config cache)
```

Every browser call goes to the app's own `/api/*` route. That route checks the session and forwards to the service with `x-internal-key` and `x-user-id`. Services reject calls without the key. Collab is the only service the browser talks to directly, using a 10-minute document-scoped JWT minted by Margin.

## Quick start

```bash
make setup      # .env with fresh secrets, npm + uv deps, Postgres/Redis, migrations
make dev        # all 4 apps + 4 services, hot reload, prefixed logs
```

Then open http://localhost:3001 to 3004. Sign up once; the same account works in every app.

**Keys to add at the venue** (`.env`):

| Key | Unlocks | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Kestrel summaries, Boli answers | console.anthropic.com |
| `BHASHINI_USER_ID`, `BHASHINI_ULCA_API_KEY` | Boli speech and Indian languages | bhashini.gov.in/ulca → profile → generate key |
| `GITHUB_CLIENT_ID/SECRET` (optional) | "Continue with GitHub" | GitHub OAuth app, callback `<app-url>/api/auth/callback/github` |

Without keys, everything else still works and the missing pieces say exactly what to set. Boli drops to typed English only.

## Make targets

| | |
|---|---|
| `make dev` | everything with hot reload (`scripts/dev.sh`) |
| `make up` / `make down` / `make logs` | the whole stack in containers (production images) |
| `make db-generate && make migrate` | after editing `packages/platform/src/db/schema.ts` |
| `make db-studio` / `make psql` | browse the DB |
| `make test` | pytest + typecheck + lint |
| `make k8s-up` | kind cluster with ingress: `http://kestrel.localtest.me:8080` and so on (needs ~6 GB disk) |
| `make railway-plan` / `make railway-apply` | Railway IaC |

## Deploy to Railway

The project is described as code in `.railway/railway.ts` (Railway IaC): Postgres, Redis, 4 services and 4 apps. It covers private-network URLs, health checks, watch paths, and a pre-deploy migration step (advisory-locked, so it's safe on all four apps).

```bash
# 1. Push this repo to GitHub (Railway builds from it)
gh repo create megathon --private --source . --push

# 2. Create and link a Railway project
railway login
railway init                       # or: railway link

# 3. Create every service from the IaC file
export GITHUB_REPO=<you>/megathon
railway config plan                # preview
railway config apply

# 4. Secrets, provider keys (read from your .env), public domains, redeploy
./scripts/railway-secrets.sh
```

How it fits together on Railway:
- Each service builds from the repo root with a shared Dockerfile (`docker/web.Dockerfile`, `docker/python.Dockerfile`, `docker/collab.Dockerfile`).
- The `APP` / `SERVICE` service variable picks the target and is passed as a Docker build arg.
- Services listen on `::`, because Railway private networking is IPv6. They reach each other at `http://<name>.railway.internal:<port>`.
- Only the 4 apps and `collab` get public domains.

If `config apply` complains, fall back to the dashboard. For each service: create it from the GitHub repo, set root directory `/`, set variable `RAILWAY_DOCKERFILE_PATH` to the Dockerfile above, and copy the env block from `.railway/railway.ts`.

## Repo map

```
apps/{kestrel,boli,onboard,margin}   Next.js 16 (App Router, cacheComponents, Tailwind v4, Motion, Phosphor)
packages/platform                    auth (better-auth), db (drizzle), server/client helpers, shared UI, migrations
services/{common,risk,llm,bhashini}  Python uv workspace (FastAPI); one .venv, one lockfile
services/collab                      Node Hocuspocus server (TypeScript run natively by Node 24)
docker/                              3 Dockerfiles for all 8 images
.railway/railway.ts                  Railway IaC        k8s/   kustomize + kind       docker-compose.yml
```

## Adapting at the venue

- **New table:** add it to `packages/platform/src/db/schema.ts`, then run `make db-generate && make migrate`.
- **New model in Kestrel:** use "Train a model from CSV" in the console, or `POST /train` on `risk`. The form and chart adapt to the new features automatically.
- **New Boli domain:** add a system prompt to `DOMAINS` in `services/bhashini/src/bhashini_service/main.py` and a label in `apps/boli/src/lib/languages.ts`.
- **Different on-device model:** swap the model IDs in `apps/onboard/src/components/lab.tsx`. Any Transformers.js-compatible ONNX model works. For a real Snapdragon NPU demo, export the same model through Qualcomm AI Hub.
- **Rules:** disclose AI tool use in the README and the pitch.

## Images

The landing pages use `picsum.photos` placeholders (stable seeds, but random subjects). Replace them with real shots before judging:
- Kestrel: operations desk, city at night
- Boli: farmer with phone, paddy field, clinic, market, railway platform
- Onboard: street scene, phone in hand
- Margin: desk with notebook
