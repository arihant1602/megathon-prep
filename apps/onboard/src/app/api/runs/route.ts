import { desc, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId) => {
  const rows = await db
    .select()
    .from(schema.detectionRun)
    .where(eq(schema.detectionRun.userId, userId))
    .orderBy(desc(schema.detectionRun.createdAt))
    .limit(30);
  return Response.json(rows);
});

// Metadata only: task, model, backend, latency and top labels. Never pixels.
export const POST = withSession(async (req, userId) => {
  const b = await req.json();
  const labels = (Array.isArray(b.labels) ? b.labels : [])
    .slice(0, 20)
    .map((l: { label: unknown; score: unknown }) => ({ label: String(l.label).slice(0, 80), score: Number(l.score) }));
  const [row] = await db
    .insert(schema.detectionRun)
    .values({
      userId,
      task: String(b.task),
      model: String(b.model),
      backend: String(b.backend),
      latencyMs: Number(b.latencyMs),
      labels,
    })
    .returning();
  return Response.json(row, { status: 201 });
});
