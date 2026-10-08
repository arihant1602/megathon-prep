import { defineConfig } from "drizzle-kit";

// Local: load the repo-root .env. In Docker/Railway env vars are injected directly.
try {
  process.loadEnvFile("../../.env");
} catch {}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
