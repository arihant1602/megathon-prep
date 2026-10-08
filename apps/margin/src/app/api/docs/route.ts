import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId) => {
  const rows = await db
    .selectDistinct({
      id: schema.document.id,
      title: schema.document.title,
      ownerId: schema.document.ownerId,
      updatedAt: schema.document.updatedAt,
    })
    .from(schema.document)
    .leftJoin(schema.documentMember, eq(schema.documentMember.documentId, schema.document.id))
    .where(or(eq(schema.document.ownerId, userId), eq(schema.documentMember.userId, userId)))
    .orderBy(desc(schema.document.updatedAt));
  return Response.json(rows.map((r) => ({ ...r, shared: r.ownerId !== userId })));
});

export const POST = withSession(async (req, userId) => {
  const b = await req.json().catch(() => ({}));
  const [doc] = await db
    .insert(schema.document)
    .values({ id: crypto.randomUUID(), ownerId: userId, title: String(b.title || "Untitled").slice(0, 200) })
    .returning({ id: schema.document.id });
  return Response.json(doc, { status: 201 });
});
