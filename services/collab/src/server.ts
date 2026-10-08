// Realtime collaboration service (Yjs CRDT over WebSocket via Hocuspocus).
// - Auth: short-lived HS256 token minted by apps/margin after it checks document membership.
// - Read/write: viewers get a read-only connection; the server drops their updates.
// - Persistence: Yjs state stored in Postgres `document.ydoc` (debounced).
// - Offline: clients keep edits in IndexedDB; the CRDT merges them on reconnect.
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { jwtVerify } from "jose";
import pg from "pg";

const PORT = Number(process.env.PORT ?? 8004);
const secret = new TextEncoder().encode(process.env.COLLAB_JWT_SECRET ?? "");
if (!process.env.COLLAB_JWT_SECRET) throw new Error("COLLAB_JWT_SECRET is not set");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

type Claims = { sub: string; doc: string; role: "owner" | "editor" | "viewer"; name: string };

const server = new Server({
  name: "collab",
  port: PORT,
  address: "::", // Railway private networking is IPv6; "::" also accepts IPv4 on Linux.
  quiet: true,
  debounce: 1500,
  maxDebounce: 8000,

  async onRequest({ request, response }) {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "collab", documents: server.hocuspocus.getDocumentsCount() }));
      // Rejecting stops Hocuspocus from handling the request further.
      throw null;
    }
  },

  async onAuthenticate({ token, documentName, connectionConfig }) {
    let claims: Claims;
    try {
      claims = (await jwtVerify(token, secret, { algorithms: ["HS256"] })).payload as unknown as Claims;
    } catch {
      throw new Error("invalid token");
    }
    if (claims.doc !== documentName) throw new Error("token is for another document");
    connectionConfig.readOnly = claims.role === "viewer";
    return { userId: claims.sub, name: claims.name, role: claims.role };
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const r = await pool.query<{ ydoc: Buffer | null }>("select ydoc from document where id = $1", [documentName]);
        return r.rows[0]?.ydoc ?? null;
      },
      async store({ documentName, state }) {
        await pool.query("update document set ydoc = $2, updated_at = now() where id = $1", [documentName, state]);
      },
    }),
  ],
});

await server.listen();
console.log(`collab listening on :${PORT}`);
