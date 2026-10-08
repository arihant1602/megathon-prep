// Browser-side fetch helpers for an app's own /api routes.

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = await res.text();
    try {
      msg = JSON.parse(msg).detail ?? msg;
    } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

/** Reads `data: {"text": "..."}` server-sent events. */
export async function* streamText(path: string, body: unknown): AsyncGenerator<string> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(await res.text());
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!line || line === "data: [DONE]") continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.error) throw new Error(payload.error);
      if (payload.text) yield payload.text;
    }
  }
}
