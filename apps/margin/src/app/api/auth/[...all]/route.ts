import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@mega/platform/auth";

export const { GET, POST } = toNextJsHandler(auth);
