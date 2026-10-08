import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId, ctx) => {
  const { id } = (await ctx.params) as { id: string };
  const [conv] = await db
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.id, Number(id)), eq(schema.conversation.userId, userId)));
  if (!conv) return Response.json({ detail: "not found" }, { status: 404 });
  const utterances = await db
    .select()
    .from(schema.utterance)
    .where(eq(schema.utterance.conversationId, conv.id))
    .orderBy(asc(schema.utterance.id));
  return Response.json({ ...conv, utterances });
});
