"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUp, Info, Microphone, Plus, SignOut, Stop } from "@phosphor-icons/react";
import { api } from "@mega/platform/client";
import { signOut } from "@mega/platform/auth-client";
import { Logo } from "./logo";
import { DOMAIN_LABEL, NATIVE } from "@/lib/languages";
import { startRecording } from "@/lib/wav";

type Meta = { languages: Record<string, string>; domains: string[]; configured: boolean };
type Turn = { role: "user" | "assistant"; native: string; english: string | null; audio?: string | null };
type Conversation = { id: number; language: string; domain: string; createdAt: string };
type AssistOut = {
  conversationId: number;
  question: { native: string; english: string };
  answer: { native: string; english: string };
  audio_b64: string | null;
};

export function Talk({ email }: { email: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [language, setLanguage] = useState("hi");
  const [domain, setDomain] = useState("agriculture");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [history, setHistory] = useState<Conversation[] | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "recording" | "thinking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const stopRef = useRef<(() => Promise<string>) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Meta>("/api/meta")
      .then((m) => {
        setMeta(m);
        if (!m.configured) setLanguage("en");
      })
      .catch((e) => setMetaError(e.message));
    api<Conversation[]>("/api/conversations").then(setHistory).catch(() => setHistory([]));
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }), [turns, reduce]);

  const speechReady = meta?.configured ?? false;

  async function ask(payload: { text?: string; audio_b64?: string }) {
    setState("thinking");
    setError(null);
    try {
      const out = await api<AssistOut>("/api/assist", { conversationId, language, domain, speak: speechReady, ...payload });
      if (!conversationId) {
        setConversationId(out.conversationId);
        setHistory((h) => [{ id: out.conversationId, language, domain, createdAt: new Date().toISOString() }, ...(h ?? [])]);
      }
      setTurns((t) => [
        ...t,
        { role: "user", native: out.question.native, english: out.question.english },
        { role: "assistant", native: out.answer.native, english: out.answer.english, audio: out.audio_b64 },
      ]);
      if (out.audio_b64) new Audio(`data:audio/wav;base64,${out.audio_b64}`).play().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setState("idle");
    }
  }

  async function toggleMic() {
    if (state === "recording" && stopRef.current) {
      const audio = await stopRef.current();
      stopRef.current = null;
      await ask({ audio_b64: audio });
      return;
    }
    try {
      stopRef.current = await startRecording();
      setState("recording");
      setError(null);
    } catch {
      setError("Microphone permission was blocked. Allow it in the browser bar, or type instead.");
    }
  }

  async function openConversation(id: number) {
    const c = await api<Conversation & { utterances: { role: Turn["role"]; textNative: string; textEnglish: string | null }[] }>(
      `/api/conversations/${id}`,
    );
    setConversationId(c.id);
    setLanguage(c.language);
    setDomain(c.domain);
    setTurns(c.utterances.map((u) => ({ role: u.role, native: u.textNative, english: u.textEnglish })));
  }

  function newConversation() {
    setConversationId(null);
    setTurns([]);
    setError(null);
  }

  const languages = meta ? Object.keys(meta.languages).filter((l) => speechReady || l === "en") : [];

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[280px_1fr]">
      <aside className="hidden flex-col gap-6 border-r border-line bg-surface p-5 lg:flex">
        <Logo />
        <button
          onClick={newConversation}
          className="inline-flex items-center justify-center gap-2 rounded-ui border border-line px-4 py-2 text-sm font-medium transition hover:bg-bg"
        >
          <Plus /> New conversation
        </button>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          <p className="mb-1 text-sm font-medium text-muted">Earlier</p>
          {history === null ? (
            Array.from({ length: 4 }).map((_, i) => <span key={i} className="h-10 animate-pulse rounded-ui bg-line" />)
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">Your conversations will show up here.</p>
          ) : (
            history.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`rounded-ui px-3 py-2 text-left text-sm transition hover:bg-bg ${c.id === conversationId ? "bg-bg font-medium" : ""}`}
              >
                {DOMAIN_LABEL[c.domain] ?? c.domain} in {NATIVE[c.language] ?? c.language}
                <span className="block text-xs text-muted">
                  {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          <span className="truncate">{email}</span>
          <button
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="rounded-ui p-2 transition hover:bg-bg"
          >
            <SignOut size={18} />
          </button>
        </div>
      </aside>

      <main className="flex min-h-[100dvh] flex-col">
        <div className="flex flex-col gap-4 border-b border-line px-4 py-4 md:px-8">
          <div className="flex items-center justify-between lg:hidden">
            <Logo />
            <button onClick={newConversation} className="rounded-ui border border-line px-3 py-1.5 text-sm">
              New
            </button>
          </div>
          {metaError && <p className="text-sm text-red-700 dark:text-red-400">Speech service unavailable: {metaError}</p>}
          {meta && !speechReady && (
            <p className="flex items-start gap-2 rounded-ui bg-accent-soft p-3 text-sm">
              <Info size={18} className="mt-0.5 shrink-0 text-accent" />
              Bhashini keys are not set, so only typed English works. Add BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY to enable
              speech and Indian languages.
            </p>
          )}
          <fieldset className="flex flex-wrap gap-2" disabled={turns.length > 0}>
            <legend className="sr-only">Language</legend>
            {meta === null
              ? Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-9 w-20 animate-pulse rounded-ui bg-line" />)
              : languages.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    aria-pressed={l === language}
                    className={`rounded-ui border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
                      l === language ? "border-accent bg-accent text-accent-fg" : "border-line hover:bg-surface"
                    }`}
                  >
                    {NATIVE[l] ?? l}
                  </button>
                ))}
          </fieldset>
          <fieldset className="flex flex-wrap gap-2" disabled={turns.length > 0}>
            <legend className="sr-only">Topic</legend>
            {(meta?.domains ?? []).map((d) => (
              <button
                key={d}
                onClick={() => setDomain(d)}
                aria-pressed={d === domain}
                className={`rounded-ui px-3 py-1 text-sm transition disabled:opacity-60 ${
                  d === domain ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg"
                }`}
              >
                {DOMAIN_LABEL[d] ?? d}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showEnglish} onChange={(e) => setShowEnglish(e.target.checked)} className="accent-[var(--accent)]" />
              Show English
            </label>
          </fieldset>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {turns.length === 0 && state === "idle" ? (
            <div className="mx-auto mt-16 max-w-md text-center text-muted">
              <p className="text-lg text-fg">Tap the microphone and ask your question.</p>
              <p className="mt-2 text-sm">
                Try: &ldquo;धान में कीड़े लग गए हैं, क्या करें?&rdquo; or type in the box below.
              </p>
            </div>
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-4">
              {turns.map((t, i) => (
                <motion.li
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 140, damping: 20 }}
                  className={t.role === "user" ? "self-end max-w-[85%]" : "max-w-[85%]"}
                >
                  <div className={`rounded-ui px-4 py-3 leading-relaxed ${t.role === "user" ? "bg-accent text-accent-fg" : "border border-line bg-surface"}`}>
                    {t.native}
                    {showEnglish && t.english && t.english !== t.native && (
                      <p className={`mt-2 border-t pt-2 text-sm ${t.role === "user" ? "border-accent-fg/30 opacity-85" : "border-line text-muted"}`}>{t.english}</p>
                    )}
                  </div>
                  {t.audio && <audio controls src={`data:audio/wav;base64,${t.audio}`} className="mt-2 h-9 w-full max-w-xs" />}
                </motion.li>
              ))}
              {state === "thinking" && (
                <li className="flex max-w-[60%] flex-col gap-2" aria-live="polite">
                  <span className="sr-only">Working on your answer</span>
                  <span className="h-4 w-full animate-pulse rounded-ui bg-line" />
                  <span className="h-4 w-2/3 animate-pulse rounded-ui bg-line" />
                </li>
              )}
            </ul>
          )}
          {error && <p role="alert" className="mx-auto mt-4 max-w-3xl text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && state === "idle") {
              ask({ text });
              setText("");
            }
          }}
          className="border-t border-line px-4 py-4 md:px-8"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={toggleMic}
              disabled={!speechReady || state === "thinking"}
              aria-label={state === "recording" ? "Stop recording" : "Start recording"}
              className={`grid size-14 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
                state === "recording" ? "bg-fg text-bg" : "bg-accent text-accent-fg"
              }`}
            >
              {state === "recording" ? <Stop size={24} weight="fill" /> : <Microphone size={24} weight="fill" />}
            </button>
            <label htmlFor="question" className="sr-only">
              Type your question
            </label>
            <input
              id="question"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={state === "recording" ? "Listening. Tap stop when you finish." : "Or type your question"}
              className="min-w-0 flex-1 rounded-ui border border-line bg-surface px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              disabled={!text.trim() || state !== "idle"}
              aria-label="Send"
              className="grid size-12 shrink-0 place-items-center rounded-ui border border-line transition hover:bg-surface disabled:opacity-40"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
