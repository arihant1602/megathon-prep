import { eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";
import { getRole } from "@/lib/access";

export const PATCH = withSession(async (req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  const role = await getRole(id, userId);
  if (role !== "owner" && role !== "editor") return Response.json({ detail: "forbidden" }, { status: 403 });
  const b = await req.json();
  await db
    .update(schema.document)
    .set({ title: String(b.title || "Untitled").slice(0, 200), updatedAt: new Date() })
    .where(eq(schema.document.id, id));
  return Response.json({ ok: true });
});

export const DELETE = withSession(async (_req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  if ((await getRole(id, userId)) !== "owner") return Response.json({ detail: "only the owner can delete" }, { status: 403 });
  await db.delete(schema.document).where(eq(schema.document.id, id));
  return Response.json({ ok: true });
});
