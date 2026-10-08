import { desc, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId) => {
  const rows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.userId, userId))
    .orderBy(desc(schema.conversation.createdAt))
    .limit(50);
  return Response.json(rows);
});
