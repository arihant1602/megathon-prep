"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  ArrowLeft,
  Code,
  ListBullets,
  ListNumbers,
  Quotes,
  ShareNetwork,
  TextB,
  TextHTwo,
  TextItalic,
  X,
} from "@phosphor-icons/react";
import { api } from "@mega/platform/client";
import type { Role } from "@/lib/access";

type Status = "connecting" | "connected" | "disconnected";
type Peer = { name: string; color: string };

// Deterministic, readable caret colours (white label text on each).
const COLORS = ["#b2294e", "#2563a8", "#0f7a55", "#8a4bc2", "#b45309", "#0e7490"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function DocEditor({ id, initialTitle, role, user }: { id: string; initialTitle: string; role: Role; user: { id: string; name: string } }) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [synced, setSynced] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Local copy first: offline edits survive reloads and merge on reconnect.
    const local = new IndexeddbPersistence(`margin-${id}`, ydoc);
    let p: HocuspocusProvider | null = null;
    let cancelled = false;

    (async () => {
      const { url } = await api<{ url: string }>(`/api/docs/${id}/token`);
      if (cancelled) return;
      p = new HocuspocusProvider({
        url,
        name: id,
        document: ydoc,
        // Fetched on every (re)connect, so expired tokens refresh themselves.
        token: async () => (await api<{ token: string }>(`/api/docs/${id}/token`)).token,
        onStatus: ({ status }) => setStatus(status as Status),
        onSynced: ({ state }) => setSynced(state),
        onAuthenticationFailed: ({ reason }) => setAuthError(reason),
      });
      setProvider(p);
    })().catch((e) => setAuthError(String(e)));

    return () => {
      cancelled = true;
      p?.destroy();
      local.destroy();
    };
  }, [id, ydoc]);

  return (
    <div className="min-h-[100dvh]">
      <TopBar id={id} initialTitle={initialTitle} role={role} status={status} synced={synced} online={online} provider={provider} />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-32 md:px-8">
        {authError && (
          <p role="alert" className="mb-6 rounded-ui border border-line bg-surface p-3 text-sm">
            Could not connect to the sync service: {authError}. Your edits are still saved on this device.
          </p>
        )}
        {role === "viewer" && (
          <p className="mb-6 rounded-ui bg-accent-soft p-3 text-sm">You have view access. Changes from editors appear here live.</p>
        )}
        {provider ? (
          <CollabEditor ydoc={ydoc} provider={provider} editable={role !== "viewer"} user={{ name: user.name, color: colorFor(user.id) }} />
        ) : (
          <div className="flex flex-col gap-3">
            <span className="h-6 w-2/3 animate-pulse rounded-ui bg-line" />
            <span className="h-4 w-full animate-pulse rounded-ui bg-line" />
            <span className="h-4 w-5/6 animate-pulse rounded-ui bg-line" />
          </div>
        )}
      </main>
    </div>
  );
}

function CollabEditor({ ydoc, provider, editable, user }: { ydoc: Y.Doc; provider: HocuspocusProvider; editable: boolean; user: Peer }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Yjs provides collaborative undo
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider, user }),
    ],
    editorProps: { attributes: { class: "prose-doc", "aria-label": "Document body" } },
  });

  if (!editor) return null;
  return (
    <>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const items = [
    { icon: TextB, label: "Bold", active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { icon: TextItalic, label: "Italic", active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { icon: TextHTwo, label: "Heading", active: editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: ListBullets, label: "Bulleted list", active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListNumbers, label: "Numbered list", active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: Quotes, label: "Quote", active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { icon: Code, label: "Code block", active: editor.isActive("codeBlock"), run: () => editor.chain().focus().toggleCodeBlock().run() },
  ];
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-16 z-10 -mx-2 mb-6 flex flex-wrap gap-1 bg-bg/95 px-2 py-2 backdrop-blur">
      {items.map(({ icon: Icon, label, active, run }) => (
        <button
          key={label}
          onClick={run}
          aria-label={label}
          aria-pressed={active}
          className={`rounded-ui p-2 transition ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-fg"}`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}

function TopBar({
  id,
  initialTitle,
  role,
  status,
  synced,
  online,
  provider,
}: {
  id: string;
  initialTitle: string;
  role: Role;
  status: Status;
  synced: boolean;
  online: boolean;
  provider: HocuspocusProvider | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const aw = provider?.awareness;
    if (!aw) return;
    const update = () =>
      setPeers(
        [...aw.getStates().entries()]
          .filter(([clientId, s]) => clientId !== aw.clientID && s.user)
          .map(([, s]) => s.user as Peer),
      );
    aw.on("change", update);
    update();
    return () => aw.off("change", update);
  }, [provider]);

  // Semantic sync state: the one place a status dot carries real information.
  const state = !online || status === "disconnected" ? ["Offline, saving locally", "bg-amber-500"] : status === "connecting" || !synced ? ["Syncing", "bg-muted"] : ["Synced", "bg-emerald-600"];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 md:px-8">
        <Link href="/docs" aria-label="All documents" className="rounded-ui p-2 text-muted transition hover:bg-surface hover:text-fg">
          <ArrowLeft />
        </Link>
        <label htmlFor="doc-title" className="sr-only">
          Title
        </label>
        <input
          id="doc-title"
          value={title}
          readOnly={role === "viewer"}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== initialTitle && api(`/api/docs/${id}`, { title }, "PATCH").catch(() => {})}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
        />
        <span className="hidden items-center gap-2 text-xs text-muted sm:flex" aria-live="polite">
          <span className={`size-2 rounded-full ${state[1]}`} /> {state[0]}
        </span>
        <div className="flex -space-x-2">
          {peers.slice(0, 4).map((p, i) => (
            <span
              key={i}
              title={p.name}
              className="grid size-8 place-items-center rounded-full border-2 border-bg text-xs font-semibold text-white"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        {role === "owner" && (
          <button
            onClick={() => setSharing(true)}
            className="inline-flex items-center gap-1.5 rounded-ui bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition active:scale-[0.98]"
          >
            <ShareNetwork /> Share
          </button>
        )}
      </div>
      {sharing && <ShareDialog id={id} onClose={() => setSharing(false)} />}
    </header>
  );
}

type Member = { userId: string; email: string; name: string; role: "editor" | "viewer" };

function ShareDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Member[]>(`/api/docs/${id}/members`).then(setMembers).catch((e) => setError(e.message));
  }, [id]);

  async function add(form: FormData) {
    setError(null);
    try {
      const m = await api<Member>(`/api/docs/${id}/members`, { email: form.get("email"), role: form.get("role") });
      setMembers((ms) => [...(ms ?? []).filter((x) => x.userId !== m.userId), m]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(userId: string) {
    await api(`/api/docs/${id}/members`, { userId }, "DELETE");
    setMembers((ms) => ms?.filter((m) => m.userId !== userId) ?? null);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fixed inset-0 z-30 grid place-items-center bg-fg/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-ui border border-line bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-semibold">
            Share
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-ui p-1.5 text-muted hover:bg-bg">
            <X />
          </button>
        </div>
        <form action={add} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <input name="email" type="email" required className="rounded-ui border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          </label>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="share-role">
              Role
            </label>
            <select id="share-role" name="role" className="rounded-ui border border-line bg-bg px-3 py-2 text-sm">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="flex-1 rounded-ui bg-accent px-4 py-2 text-sm font-medium text-accent-fg">Add person</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        </form>
        <ul className="mt-5 flex flex-col gap-2">
          {members === null ? (
            <span className="h-10 animate-pulse rounded-ui bg-line" />
          ) : members.length === 0 ? (
            <p className="text-sm text-muted">Only you can see this document.</p>
          ) : (
            members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {m.email} <span className="text-muted">({m.role === "editor" ? "can edit" : "can view"})</span>
                </span>
                <button onClick={() => remove(m.userId)} className="text-muted underline underline-offset-4 hover:text-fg">
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
