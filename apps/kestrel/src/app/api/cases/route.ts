import { desc, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId) => {
  const rows = await db
    .select()
    .from(schema.riskCase)
    .where(eq(schema.riskCase.userId, userId))
    .orderBy(desc(schema.riskCase.createdAt))
    .limit(100);
  return Response.json(rows);
});

export const POST = withSession(async (req, userId) => {
  const b = await req.json();
  const [row] = await db
    .insert(schema.riskCase)
    .values({
      userId,
      model: String(b.model),
      reference: String(b.reference || `CASE-${Date.now().toString(36).toUpperCase()}`),
      input: b.input,
      score: Number(b.score),
      contributions: b.contributions,
      summary: b.summary ?? null,
    })
    .returning();
  return Response.json(row, { status: 201 });
});
