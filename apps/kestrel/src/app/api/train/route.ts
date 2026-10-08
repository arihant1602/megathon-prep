import { forwardToService, withSession } from "@mega/platform/server";

// Multipart CSV upload streamed straight to the risk service.
export const POST = withSession(async (req, userId) => forwardToService(req, process.env.RISK_SERVICE_URL, "/train", userId));
