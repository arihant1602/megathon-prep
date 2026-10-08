import { and, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";
import { getRole } from "@/lib/access";

export const GET = withSession(async (_req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  if (!(await getRole(id, userId))) return Response.json({ detail: "not found" }, { status: 404 });
  const rows = await db
    .select({ userId: schema.user.id, email: schema.user.email, name: schema.user.name, role: schema.documentMember.role })
    .from(schema.documentMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.documentMember.userId))
    .where(eq(schema.documentMember.documentId, id));
  return Response.json(rows);
});

// Owner shares by email. The person needs an account (any of the four apps).
export const POST = withSession(async (req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  if ((await getRole(id, userId)) !== "owner") return Response.json({ detail: "only the owner can share" }, { status: 403 });
  const b = await req.json();
  const role = b.role === "viewer" ? "viewer" : "editor";
  const [target] = await db.select().from(schema.user).where(eq(schema.user.email, String(b.email).trim().toLowerCase()));
  if (!target) return Response.json({ detail: "No account with that email yet. Ask them to sign up first." }, { status: 404 });
  if (target.id === userId) return Response.json({ detail: "You already own this document." }, { status: 400 });
  await db
    .insert(schema.documentMember)
    .values({ documentId: id, userId: target.id, role })
    .onConflictDoUpdate({ target: [schema.documentMember.documentId, schema.documentMember.userId], set: { role } });
  return Response.json({ userId: target.id, email: target.email, name: target.name, role }, { status: 201 });
});

export const DELETE = withSession(async (req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  if ((await getRole(id, userId)) !== "owner") return Response.json({ detail: "forbidden" }, { status: 403 });
  const { userId: member } = await req.json();
  await db.delete(schema.documentMember).where(and(eq(schema.documentMember.documentId, id), eq(schema.documentMember.userId, String(member))));
  return Response.json({ ok: true });
});
