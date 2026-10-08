/// <reference lib="webworker" />
// Runs Transformers.js entirely in this worker: WebGPU when available, otherwise WASM.
// The library is loaded from a pinned CDN build (keeps ~350 MB of Node ONNX binaries out of the repo);
// model weights download once from the Hugging Face hub and are cached by the browser.

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

export type Task = "object-detection" | "image-classification";
export type WorkerIn = { type: "run"; id: number; task: Task; model: string; image: Blob };
export type WorkerOut =
  | { type: "progress"; file: string; progress: number }
  | { type: "ready"; task: Task; device: "webgpu" | "wasm" }
  | { type: "result"; id: number; task: Task; device: string; latencyMs: number; output: unknown }
  | { type: "error"; id: number; message: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
let lib: any;
const pipes = new Map<string, any>();
let device: "webgpu" | "wasm" | null = null;
const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

// `navigator.gpu` can exist with no usable adapter (headless, blocklisted GPUs), so ask for one.
async function pickDevice(): Promise<"webgpu" | "wasm"> {
  try {
    if ("gpu" in navigator && (await (navigator as any).gpu.requestAdapter())) return "webgpu";
  } catch {}
  return "wasm";
}

async function load(task: Task, model: string, dev: "webgpu" | "wasm") {
  return lib.pipeline(task, model, {
    device: dev,
    dtype: dev === "webgpu" ? "fp32" : "q8",
    progress_callback: (p: any) => p.status === "progress" && post({ type: "progress", file: p.file, progress: p.progress }),
  });
}

async function getPipe(task: Task, model: string) {
  const key = `${task}:${model}`;
  if (pipes.has(key)) return pipes.get(key);
  lib ??= await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB);
  lib.env.allowLocalModels = false;
  device ??= await pickDevice();
  let pipe;
  try {
    pipe = await load(task, model, device);
  } catch (err) {
    if (device !== "webgpu") throw err;
    device = "wasm"; // WebGPU init failed on this machine: fall back to CPU.
    pipe = await load(task, model, device);
  }
  pipes.set(key, pipe);
  post({ type: "ready", task, device });
  return pipe;
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { id, task, model, image } = e.data;
  try {
    const pipe = await getPipe(task, model);
    const img = await lib.RawImage.fromBlob(image);
    const t0 = performance.now();
    const output = task === "object-detection" ? await pipe(img, { threshold: 0.6, percentage: true }) : await pipe(img, { top_k: 5 });
    post({ type: "result", id, task, device: device ?? "wasm", latencyMs: performance.now() - t0, output });
  } catch (err) {
    post({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
};
