import { SignJWT } from "jose";
import { auth } from "@mega/platform/auth";
import { getRole } from "@/lib/access";

// Mints a 10-minute token the collab service trusts for this one document.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ detail: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const role = await getRole(id, session.user.id);
  if (!role) return Response.json({ detail: "not found" }, { status: 404 });
  const secret = new TextEncoder().encode(process.env.COLLAB_JWT_SECRET ?? "");
  const token = await new SignJWT({ doc: id, role, name: session.user.name || session.user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
  return Response.json({ token, url: process.env.COLLAB_PUBLIC_URL ?? "ws://localhost:8004", role });
}
