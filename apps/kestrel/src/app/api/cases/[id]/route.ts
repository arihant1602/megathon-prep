import { and, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

const STATUSES = ["open", "escalated", "cleared"] as const;

export const PATCH = withSession(async (req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  const b = await req.json();
  const patch: Partial<typeof schema.riskCase.$inferInsert> = {};
  if (STATUSES.includes(b.status)) patch.status = b.status;
  if (typeof b.note === "string") patch.note = b.note.slice(0, 2000);
  const [row] = await db
    .update(schema.riskCase)
    .set(patch)
    .where(and(eq(schema.riskCase.id, Number(id)), eq(schema.riskCase.userId, userId)))
    .returning();
  return row ? Response.json(row) : Response.json({ detail: "not found" }, { status: 404 });
});
