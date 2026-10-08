import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";

export type Role = "owner" | "editor" | "viewer";

export async function getRole(documentId: string, userId: string): Promise<Role | null> {
  const [doc] = await db.select({ ownerId: schema.document.ownerId }).from(schema.document).where(eq(schema.document.id, documentId));
  if (!doc) return null;
  if (doc.ownerId === userId) return "owner";
  const [m] = await db
    .select({ role: schema.documentMember.role })
    .from(schema.documentMember)
    .where(and(eq(schema.documentMember.documentId, documentId), eq(schema.documentMember.userId, userId)));
  return m?.role ?? null;
}
