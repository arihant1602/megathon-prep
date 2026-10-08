// Railway Infrastructure as Code for the whole Megathon stack.
//   railway login && railway init        (or `railway link` to an existing project)
//   GITHUB_REPO=<you>/<repo> railway config plan
//   GITHUB_REPO=<you>/<repo> railway config apply
//   ./scripts/railway-secrets.sh          (secrets, public domains)
// Every service builds from the repo root with a shared Dockerfile; APP / SERVICE pick the target
// (Railway passes service variables to Dockerfile ARGs at build time).
import { defineRailway, github, postgres, preserve, project, redis, service } from "railway/iac";

const REPO = process.env.GITHUB_REPO;
if (!REPO) throw new Error("Set GITHUB_REPO=owner/repo before running railway config plan/apply");

// Secrets live in Railway, not in git: scripts/railway-secrets.sh sets them once and IaC keeps them.
const secret = () => preserve();

export default defineRailway(() => {
  const db = postgres("Postgres");
  const cache = redis("Redis");
  const source = github(REPO, { branch: "main" });

  const internal = (name: string, port: number) => `http://\${{${name}.RAILWAY_PRIVATE_DOMAIN}}:${port}`;

  // ---- Python microservices (private network only) ----
  const llm = service("llm", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "docker/python.Dockerfile", watchPatterns: ["services/llm/**", "services/common/**", "services/uv.lock"] },
    healthcheck: "/health",
    env: { SERVICE: "llm", PORT: "8002", INTERNAL_API_KEY: secret(), ANTHROPIC_API_KEY: secret() },
  });

  const risk = service("risk", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "docker/python.Dockerfile", watchPatterns: ["services/risk/**", "services/common/**", "services/uv.lock"] },
    healthcheck: "/health",
    env: {
      SERVICE: "risk",
      PORT: "8001",
      INTERNAL_API_KEY: secret(),
      LLM_SERVICE_URL: internal("llm", 8002),
      MODEL_DIR: "/data/models",
    },
  });

  const bhashini = service("bhashini", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "docker/python.Dockerfile", watchPatterns: ["services/bhashini/**", "services/common/**", "services/uv.lock"] },
    healthcheck: "/health",
    env: {
      SERVICE: "bhashini",
      PORT: "8003",
      INTERNAL_API_KEY: secret(),
      LLM_SERVICE_URL: internal("llm", 8002),
      REDIS_URL: cache.env.REDIS_URL,
      BHASHINI_USER_ID: secret(),
      BHASHINI_ULCA_API_KEY: secret(),
    },
  });

  // ---- Realtime collab (public WebSocket) ----
  const collab = service("collab", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "docker/collab.Dockerfile", watchPatterns: ["services/collab/**"] },
    healthcheck: "/health",
    env: { PORT: "8004", DATABASE_URL: db.env.DATABASE_URL, COLLAB_JWT_SECRET: secret() },
  });

  // ---- Next.js apps (public) ----
  const web = (app: string, extra: Record<string, string | ReturnType<typeof preserve>>) =>
    service(app, {
      source,
      build: {
        builder: "DOCKERFILE",
        dockerfilePath: "docker/web.Dockerfile",
        watchPatterns: [`apps/${app}/**`, "packages/platform/**", "package-lock.json"],
      },
      preDeploy: ["node /migrate/migrate.mjs"], // advisory-locked, safe on all four
      healthcheck: "/api/health",
      env: {
        APP: app,
        PORT: "3000",
        DATABASE_URL: db.env.DATABASE_URL,
        BETTER_AUTH_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
        BETTER_AUTH_SECRET: secret(),
        INTERNAL_API_KEY: secret(),
        GITHUB_CLIENT_ID: secret(),
        GITHUB_CLIENT_SECRET: secret(),
        ...extra,
      },
    });

  const kestrel = web("kestrel", { RISK_SERVICE_URL: internal("risk", 8001) });
  const boli = web("boli", { BHASHINI_SERVICE_URL: internal("bhashini", 8003) });
  const onboard = web("onboard", {});
  const margin = web("margin", {
    COLLAB_JWT_SECRET: secret(),
    COLLAB_PUBLIC_URL: "wss://${{collab.RAILWAY_PUBLIC_DOMAIN}}",
  });

  return project("megathon", { resources: [db, cache, llm, risk, bhashini, collab, kestrel, boli, onboard, margin] });
});
