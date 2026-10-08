import { callService, withSession } from "@mega/platform/server";

export const POST = withSession(async (req, userId) =>
  Response.json(await callService(process.env.RISK_SERVICE_URL, "/score", userId, await req.json())),
);
