import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@mega/platform/db";
import { callService, withSession } from "@mega/platform/server";

type AssistOut = {
  question: { native: string; english: string };
  answer: { native: string; english: string };
  audio_b64: string | null;
};

export const POST = withSession(async (req, userId) => {
  const b = await req.json();
  const language = String(b.language);
  const domain = String(b.domain);

  // Reuse the conversation (and its English history) or start a new one.
  let conversationId: number | null = b.conversationId ? Number(b.conversationId) : null;
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const [conv] = await db
      .select()
      .from(schema.conversation)
      .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.userId, userId)));
    if (!conv) return Response.json({ detail: "conversation not found" }, { status: 404 });
    const rows = await db
      .select()
      .from(schema.utterance)
      .where(eq(schema.utterance.conversationId, conversationId))
      .orderBy(asc(schema.utterance.id));
    history = rows.slice(-12).map((r) => ({ role: r.role, content: r.textEnglish ?? r.textNative }));
  }

  const out = await callService<AssistOut>(process.env.BHASHINI_SERVICE_URL, "/assist", userId, {
    language,
    domain,
    text: b.text || null,
    audio_b64: b.audio_b64 || null,
    history,
    speak: b.speak !== false,
  });

  if (!conversationId) {
    const [conv] = await db.insert(schema.conversation).values({ userId, language, domain }).returning();
    conversationId = conv.id;
  }
  await db.insert(schema.utterance).values([
    { conversationId, role: "user", textNative: out.question.native, textEnglish: out.question.english },
    { conversationId, role: "assistant", textNative: out.answer.native, textEnglish: out.answer.english },
  ]);
  return Response.json({ conversationId, ...out });
});
