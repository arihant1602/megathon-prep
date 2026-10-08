"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, ShareNetwork, SignOut } from "@phosphor-icons/react";
import { api } from "@mega/platform/client";
import { signOut } from "@mega/platform/auth-client";

type Doc = { id: string; title: string; updatedAt: string; shared: boolean };

export function DocList({ email }: { email: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<Doc[]>("/api/docs").then(setDocs).catch((e) => setError(e.message));
  }, []);

  async function create() {
    setCreating(true);
    const { id } = await api<{ id: string }>("/api/docs", { title: "Untitled" });
    router.push(`/docs/${id}`);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted">{email}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98] disabled:opacity-60"
          >
            <Plus weight="bold" /> {creating ? "Creating" : "New document"}
          </button>
          <button
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="rounded-ui border border-line px-3 transition hover:bg-surface"
          >
            <SignOut />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="mt-8">
        {docs === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className="h-16 animate-pulse rounded-ui bg-line" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-ui border border-dashed border-line p-10 text-center">
            <FileText size={32} weight="duotone" className="mx-auto text-accent" />
            <p className="mt-3 font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-muted">Create one, then share it with a teammate&apos;s email.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/docs/${d.id}`} className="flex items-start gap-3 rounded-ui border border-line bg-surface p-4 transition hover:border-accent">
                  <FileText size={22} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      {d.shared && <ShareNetwork />}
                      {d.shared ? "Shared with you" : "Yours"} | edited{" "}
                      {new Date(d.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
