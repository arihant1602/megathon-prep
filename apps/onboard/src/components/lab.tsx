"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FloppyDisk, ImageSquare, Play, SignOut, Stop } from "@phosphor-icons/react";
import { api } from "@mega/platform/client";
import { signOut } from "@mega/platform/auth-client";
import type { Task, WorkerIn, WorkerOut } from "@/lib/vision.worker";
import { Logo } from "./logo";

const MODELS: Record<Task, { id: string; label: string }> = {
  "object-detection": { id: "Xenova/yolos-tiny", label: "Detect objects" },
  "image-classification": { id: "Xenova/mobilevit-small", label: "Classify scene" },
};

type Box = { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } };
type Label = { label: string; score: number };
type Result = { task: Task; device: string; latencyMs: number; labels: Label[]; boxes: Box[] };
type Run = { id: number; task: string; backend: string; latencyMs: number; labels: Label[]; createdAt: string };

export function Lab({ email }: { email: string }) {
  const router = useRouter();
  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [media, setMedia] = useState<HTMLVideoElement | HTMLImageElement | null>(null);
  // Stable callback refs: keep the element for imperative use and in state for the box overlay.
  const videoCb = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) setMedia(el);
  }, []);
  const imgCb = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (el) setMedia(el);
  }, []);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(false);
  const reqId = useRef(0);

  const [task, setTask] = useState<Task>("object-detection");
  const [source, setSource] = useState<"none" | "camera" | "image">("none");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ file: string; progress: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const pending = useRef(new Map<number, (r: Result | null) => void>());

  useEffect(() => {
    const w = new Worker(new URL("../lib/vision.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "progress") setLoading({ file: m.file, progress: m.progress });
      if (m.type === "ready") setLoading(null);
      if (m.type === "result") {
        const out = m.output as Box[] | Label[];
        const boxes = m.task === "object-detection" ? (out as Box[]) : [];
        const labels = (m.task === "object-detection" ? summarize(out as Box[]) : (out as Label[])).slice(0, 8);
        const r = { task: m.task, device: m.device, latencyMs: m.latencyMs, labels, boxes };
        setResult(r);
        pending.current.get(m.id)?.(r);
        pending.current.delete(m.id);
      }
      if (m.type === "error") {
        setError(m.message);
        setLoading(null);
        pending.current.get(m.id)?.(null);
        pending.current.delete(m.id);
      }
    };
    workerRef.current = w;
    api<Run[]>("/api/runs").then(setRuns).catch(() => setRuns([]));
    return () => {
      w.terminate();
      liveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const infer = useCallback(
    async (blob: Blob) => {
      const id = ++reqId.current;
      const msg: WorkerIn = { type: "run", id, task, model: MODELS[task].id, image: blob };
      return new Promise<Result | null>((resolve) => {
        pending.current.set(id, resolve);
        workerRef.current?.postMessage(msg);
      });
    },
    [task],
  );

  async function frameBlob(): Promise<Blob | null> {
    if (source === "camera" && videoRef.current) {
      const v = videoRef.current;
      const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
      c.getContext("2d")!.drawImage(v, 0, 0);
      return c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    }
    if (source === "image" && imageUrl) return (await fetch(imageUrl)).blob();
    return null;
  }

  async function runOnce() {
    const blob = await frameBlob();
    if (!blob) return;
    setBusy(true);
    setError(null);
    await infer(blob);
    setBusy(false);
  }

  async function toggleLive() {
    if (live) {
      liveRef.current = false;
      setLive(false);
      return;
    }
    liveRef.current = true;
    setLive(true);
    // Inference loop: next frame only after the previous one finishes, so the worker never queues up.
    while (liveRef.current) {
      const blob = await frameBlob();
      if (!blob || !(await infer(blob))) break;
    }
    liveRef.current = false;
    setLive(false);
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280 } });
      streamRef.current = stream;
      setSource("camera");
      setResult(null);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setError("Camera permission was blocked. Allow it in the browser bar, or upload a photo.");
    }
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    liveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setSource("image");
    setResult(null);
  }

  async function save() {
    if (!result) return;
    const row = await api<Run>("/api/runs", {
      task: result.task,
      model: MODELS[result.task].id,
      backend: result.device,
      latencyMs: result.latencyMs,
      labels: result.labels,
    });
    setRuns((r) => [row, ...(r ?? [])]);
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{email}</span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
              className="rounded-ui border border-line p-1.5 transition hover:bg-surface"
            >
              <SignOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex rounded-ui border border-line p-0.5">
              {(Object.keys(MODELS) as Task[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === task}
                  disabled={live}
                  onClick={() => {
                    setTask(t);
                    setResult(null);
                  }}
                  className={`rounded-ui px-3 py-1.5 text-sm font-medium transition ${t === task ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
                >
                  {MODELS[t].label}
                </button>
              ))}
            </div>
            <button onClick={startCamera} className="inline-flex items-center gap-1.5 rounded-ui border border-line px-3 py-1.5 text-sm transition hover:bg-surface">
              <Camera /> Camera
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-ui border border-line px-3 py-1.5 text-sm transition hover:bg-surface">
              <ImageSquare /> Upload photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
            </label>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-ui border border-line bg-surface">
            {source === "none" && (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
                <p>
                  Start the camera or upload a photo. The first run downloads the model once
                  <br className="hidden sm:block" /> (a few MB), then it is cached on this device.
                </p>
              </div>
            )}
            {source === "camera" && <video ref={videoCb} autoPlay playsInline muted className="h-full w-full object-contain" />}
            {source === "image" && imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgCb} src={imageUrl} alt="Uploaded" className="h-full w-full object-contain" />
            )}
            {result?.boxes.length ? <BoxLayer boxes={result.boxes} media={media} /> : null}
            {loading && (
              <div className="absolute inset-x-0 bottom-0 bg-bg/90 px-4 py-2 font-mono text-xs">
                Loading {loading.file.split("/").pop()} {Math.round(loading.progress)}%
                <div className="mt-1 h-0.5 bg-accent" style={{ width: `${loading.progress}%` }} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runOnce}
              disabled={source === "none" || busy || live}
              className="inline-flex items-center gap-1.5 rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98] disabled:opacity-50"
            >
              <Play weight="fill" /> {busy ? "Running" : "Run once"}
            </button>
            <button
              onClick={toggleLive}
              disabled={source !== "camera"}
              className="inline-flex items-center gap-1.5 rounded-ui border border-line px-4 py-2 font-medium transition hover:bg-surface disabled:opacity-50"
            >
              {live ? <Stop weight="fill" /> : <Play />} {live ? "Stop live" : "Live"}
            </button>
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-ui border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Result</h2>
              {result && (
                <p className="font-mono text-xs text-muted">
                  <span className="text-accent">{result.device}</span> {result.latencyMs.toFixed(0)} ms
                </p>
              )}
            </div>
            {!result ? (
              <p className="mt-3 text-sm text-muted">Nothing yet. Labels and timings appear here after a run.</p>
            ) : result.labels.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No objects above 60% confidence. Try better light or a closer shot.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {result.labels.map((l) => (
                  <li key={l.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{l.label}</span>
                    <span className="font-mono text-muted">{(l.score * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={save}
              disabled={!result || live}
              className="mt-5 inline-flex items-center gap-1.5 rounded-ui border border-line px-3 py-1.5 text-sm transition hover:bg-bg disabled:opacity-50"
            >
              <FloppyDisk /> Save run summary
            </button>
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Saved runs</h2>
            {runs === null ? (
              <div className="h-24 animate-pulse rounded-ui bg-line" />
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted">No saved runs. Only labels and latency are stored, never images.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-ui border border-line">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="truncate">{r.labels.map((l) => l.label).slice(0, 3).join(", ") || "no labels"}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {r.backend} {r.latencyMs.toFixed(0)} ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function summarize(boxes: Box[]): Label[] {
  const best = new Map<string, number>();
  for (const b of boxes) best.set(b.label, Math.max(best.get(b.label) ?? 0, b.score));
  return [...best].map(([label, score]) => ({ label, score })).sort((a, b) => b.score - a.score);
}

/** Boxes are percentages of the source image; map them onto the object-contain rendered area. */
function BoxLayer({ boxes, media }: { boxes: Box[]; media: HTMLVideoElement | HTMLImageElement | null }) {
  if (!media) return null;
  const natW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const natH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  const { clientWidth: cw, clientHeight: ch } = media;
  if (!natW || !natH) return null;
  const scale = Math.min(cw / natW, ch / natH);
  const w = natW * scale;
  const h = natH * scale;
  const ox = (cw - w) / 2;
  const oy = (ch - h) / 2;
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((b, i) => (
        <div
          key={i}
          className="absolute border-2 border-accent"
          style={{
            left: ox + b.box.xmin * w,
            top: oy + b.box.ymin * h,
            width: (b.box.xmax - b.box.xmin) * w,
            height: (b.box.ymax - b.box.ymin) * h,
          }}
        >
          <span className="absolute -top-5 left-0 bg-accent px-1 font-mono text-[11px] text-accent-fg">
            {b.label} {(b.score * 100).toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}
