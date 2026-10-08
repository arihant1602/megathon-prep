import { callService, withSession } from "@mega/platform/server";

export const GET = withSession(async (_req, userId) =>
  Response.json(await callService(process.env.BHASHINI_SERVICE_URL, "/languages", userId)),
);
