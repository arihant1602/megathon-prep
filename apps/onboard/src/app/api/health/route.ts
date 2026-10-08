import { sql } from "drizzle-orm";
import { db } from "@mega/platform/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (e) {
    return Response.json({ ok: false, db: String(e) }, { status: 503 });
  }
}
