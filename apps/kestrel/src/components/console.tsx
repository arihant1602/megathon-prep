"use client";

import { useEffect, useState } from "react";
import { FileCsv, Sparkle, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { api } from "@mega/platform/client";
import { ShapChart, type Contribution } from "./shap-chart";

type Model = {
  name: string;
  title: string;
  description: string;
  target: string;
  metrics: { auc: number; f1: number; positive_rate: number; n_rows: number };
  features: { name: string; label: string; example: number }[];
};
type Score = { model: string; score: number; band: "low" | "medium" | "high"; contributions: Contribution[]; summary?: string | null; summary_error?: string };
type Case = { id: number; reference: string; model: string; score: number; status: "open" | "escalated" | "cleared"; note: string | null; createdAt: string };

const BAND_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export function Console() {
  const [models, setModels] = useState<Model[] | null>(null);
  const [active, setActive] = useState<string>("fraud");
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Score | null>(null);
  const [busy, setBusy] = useState<"score" | "explain" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<Case[] | null>(null);

  const model = models?.find((m) => m.name === active);

  function pick(m: Model) {
    setActive(m.name);
    setValues(Object.fromEntries(m.features.map((f) => [f.name, f.example])));
    setResult(null);
  }

  async function loadModels(select?: string) {
    try {
      const ms = await api<Model[]>("/api/models");
      setModels(ms);
      const m = ms.find((x) => x.name === select) ?? ms[0];
      if (m) pick(m);
    } catch (e) {
      setError(`Risk service: ${(e as Error).message}`);
      setModels([]);
    }
  }

  useEffect(() => {
    api<Model[]>("/api/models")
      .then((ms) => {
        setModels(ms);
        if (ms[0]) pick(ms[0]);
      })
      .catch((e) => {
        setError(`Risk service: ${e.message}`);
        setModels([]);
      });
    api<Case[]>("/api/cases").then(setCases).catch(() => setCases([]));
  }, []);

  async function run(kind: "score" | "explain") {
    setBusy(kind);
    setError(null);
    try {
      setResult(await api<Score>(`/api/${kind}`, { model: active, features: values }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveCase() {
    if (!result) return;
    setBusy("save");
    try {
      const row = await api<Case>("/api/cases", {
        model: active,
        input: values,
        score: result.score,
        contributions: result.contributions,
        summary: result.summary ?? null,
      });
      setCases((c) => [row, ...(c ?? [])]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function updateCase(id: number, patch: Partial<Pick<Case, "status" | "note">>) {
    const row = await api<Case>(`/api/cases/${id}`, patch, "PATCH");
    setCases((cs) => cs?.map((c) => (c.id === id ? row : c)) ?? null);
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Score</h1>
            <p className="mt-1 text-sm text-muted">{model?.description ?? "Pick a model, adjust the inputs, then score."}</p>
          </div>
          <div role="tablist" className="flex rounded-ui border border-line p-1">
            {models === null
              ? [0, 1].map((i) => <span key={i} className="mx-0.5 h-8 w-24 animate-pulse rounded-ui bg-line" />)
              : models.map((m) => (
                  <button
                    key={m.name}
                    role="tab"
                    aria-selected={m.name === active}
                    onClick={() => pick(m)}
                    className={`rounded-ui px-3 py-1.5 text-sm font-medium transition ${
                      m.name === active ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {m.title}
                  </button>
                ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-ui border border-line bg-surface p-3 text-sm">
            <WarningCircle size={18} className="mt-0.5 shrink-0 text-accent" /> {error}
          </p>
        )}

        <div className="rounded-ui border border-line bg-surface p-5">
          {!model ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="h-4 w-32 animate-pulse rounded-ui bg-line" />
                  <span className="h-10 animate-pulse rounded-ui bg-line" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {model.features.map((f) => (
                  <label key={f.name} className="flex flex-col gap-2 text-sm font-medium">
                    {f.label}
                    <input
                      type="number"
                      step="any"
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues({ ...values, [f.name]: Number(e.target.value) })}
                      className="rounded-ui border border-line bg-bg px-3 py-2 font-mono text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => run("score")}
                  disabled={busy !== null}
                  className="rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98] disabled:opacity-60"
                >
                  {busy === "score" ? "Scoring" : "Score"}
                </button>
                <button
                  onClick={() => run("explain")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-ui border border-line px-4 py-2 font-medium transition hover:bg-bg disabled:opacity-60"
                >
                  <Sparkle /> {busy === "explain" ? "Writing summary" : "Score and explain"}
                </button>
                <span className="ml-auto font-mono text-xs text-muted">
                  AUC {model.metrics.auc.toFixed(3)} on {model.metrics.n_rows.toLocaleString("en-IN")} rows
                </span>
              </div>
            </>
          )}
        </div>

        {result && (
          <div className="rounded-ui border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="font-mono text-4xl font-semibold">
                {(result.score * 100).toFixed(1)}
                <span className="text-xl text-muted">%</span>
              </p>
              <span className="rounded-ui bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent">{BAND_LABEL[result.band]}</span>
            </div>
            <div className="mt-4">
              <ShapChart data={result.contributions} height={Math.max(180, result.contributions.length * 40)} />
            </div>
            {busy === "explain" && <div className="mt-4 h-16 animate-pulse rounded-ui bg-line" />}
            {result.summary && <p className="mt-4 max-w-[70ch] leading-relaxed">{result.summary}</p>}
            {result.summary_error && <p className="mt-4 text-sm text-muted">Summary unavailable: {result.summary_error}</p>}
            <button
              onClick={saveCase}
              disabled={busy !== null}
              className="mt-5 rounded-ui border border-line px-4 py-2 text-sm font-medium transition hover:bg-bg disabled:opacity-60"
            >
              {busy === "save" ? "Saving" : "Save as case"}
            </button>
          </div>
        )}

        <TrainPanel
          onTrained={(name) => loadModels(name)}
        />
      </section>

      <aside className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Cases</h2>
        {cases === null ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-ui bg-line" />)
        ) : cases.length === 0 ? (
          <div className="rounded-ui border border-dashed border-line p-6 text-sm text-muted">
            No cases yet. Score something on the left and choose <span className="text-fg">Save as case</span>.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cases.map((c) => (
              <CaseRow key={c.id} c={c} onChange={(patch) => updateCase(c.id, patch)} />
            ))}
          </ul>
        )}
      </aside>
    </main>
  );
}

function CaseRow({ c, onChange }: { c: Case; onChange: (p: Partial<Pick<Case, "status" | "note">>) => Promise<void> }) {
  const [note, setNote] = useState(c.note ?? "");
  return (
    <li className="rounded-ui border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm">{c.reference}</p>
          <p className="text-xs text-muted">
            {c.model} | {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <p className="font-mono text-lg font-semibold">{(c.score * 100).toFixed(1)}%</p>
      </div>
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={`status-${c.id}`}>
          Status
        </label>
        <select
          id={`status-${c.id}`}
          value={c.status}
          onChange={(e) => onChange({ status: e.target.value as Case["status"] })}
          className="rounded-ui border border-line bg-bg px-2 py-1.5 text-sm"
        >
          <option value="open">Open</option>
          <option value="escalated">Escalated</option>
          <option value="cleared">Cleared</option>
        </select>
        <label className="sr-only" htmlFor={`note-${c.id}`}>
          Note
        </label>
        <input
          id={`note-${c.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (c.note ?? "") && onChange({ note })}
          placeholder="Add a note"
          className="min-w-0 flex-1 rounded-ui border border-line bg-bg px-2 py-1.5 text-sm placeholder:text-muted"
        />
      </div>
    </li>
  );
}

function TrainPanel({ onTrained }: { onTrained: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });

  async function submit(form: FormData) {
    setState({ busy: true, msg: null });
    const res = await fetch("/api/train", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ busy: false, msg: body.detail ?? "Training failed" });
    setState({ busy: false, msg: `Trained ${body.title}: AUC ${body.metrics.auc.toFixed(3)}` });
    await onTrained(body.name);
  }

  return (
    <div className="rounded-ui border border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 p-4 text-left font-medium" aria-expanded={open}>
        <FileCsv size={20} className="text-accent" /> Train a model from CSV
      </button>
      {open && (
        <form action={submit} className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            CSV file
            <input name="file" type="file" accept=".csv" required className="text-sm" />
            <span className="text-xs font-normal text-muted">Numeric feature columns plus one 0/1 target column.</span>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Target column
            <input name="target" required className="rounded-ui border border-line bg-bg px-3 py-2" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Model name
            <input name="name" required pattern="[a-z0-9_-]{1,40}" className="rounded-ui border border-line bg-bg px-3 py-2" />
            <span className="text-xs font-normal text-muted">Lowercase letters, digits, dashes.</span>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Display title
            <input name="title" className="rounded-ui border border-line bg-bg px-3 py-2" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            What it predicts
            <input name="description" className="rounded-ui border border-line bg-bg px-3 py-2" />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              disabled={state.busy}
              className="inline-flex items-center gap-1.5 rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
            >
              <UploadSimple /> {state.busy ? "Training" : "Train"}
            </button>
            {state.msg && <p className="text-sm text-muted">{state.msg}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
