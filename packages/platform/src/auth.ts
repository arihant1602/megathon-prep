import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "./db";

// Social providers switch on automatically once their env vars are set.
const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
  socialProviders,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
  plugins: [nextCookies()], // must stay last
});

export const enabledSocialProviders = Object.keys(socialProviders) as ("github" | "google")[];
export type Session = typeof auth.$Infer.Session;
