// Applies drizzle migrations at deploy time (Railway pre-deploy, compose `migrate`, k8s Job).
// An advisory lock makes it safe when several services run it at once.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("select pg_advisory_lock(727274)");
try {
  await migrate(drizzle(client), { migrationsFolder: new URL("./drizzle", import.meta.url).pathname });
  console.log("migrations applied");
} finally {
  await client.query("select pg_advisory_unlock(727274)");
  await client.end();
}
