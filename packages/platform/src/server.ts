import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export class ServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function serviceHeaders(userId: string, contentType = "application/json") {
  return {
    "content-type": contentType,
    "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
    "x-user-id": userId,
  };
}

/** Server-to-service JSON call (Next server -> Python/Node microservice). */
export async function callService<T>(
  baseUrl: string | undefined,
  path: string,
  userId: string,
  body?: unknown,
): Promise<T> {
  if (!baseUrl) throw new ServiceError(500, "service URL env var is not set");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: serviceHeaders(userId),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ServiceError(503, `service unreachable at ${baseUrl}`);
  }
  if (!res.ok) {
    let detail = await res.text();
    try {
      detail = JSON.parse(detail).detail ?? detail;
    } catch {}
    throw new ServiceError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

/** Pass a request straight through to a service, streaming the response (SSE-safe). */
export async function forwardToService(
  req: Request,
  baseUrl: string | undefined,
  path: string,
  userId: string,
): Promise<Response> {
  if (!baseUrl) return Response.json({ detail: "service URL env var is not set" }, { status: 500 });
  try {
    const upstream = await fetch(`${baseUrl}${path}`, {
      method: req.method,
      headers: serviceHeaders(userId, req.headers.get("content-type") ?? "application/json"),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: `service unreachable at ${baseUrl}` }, { status: 503 });
  }
}

/** Wraps a route handler: 401 without a session, ServiceError -> JSON error. */
export function withSession(
  handler: (req: Request, userId: string, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return Response.json({ detail: "unauthorized" }, { status: 401 });
    try {
      return await handler(req, session.user.id, ctx);
    } catch (e) {
      if (e instanceof ServiceError) return Response.json({ detail: e.message }, { status: e.status });
      throw e;
    }
  };
}
