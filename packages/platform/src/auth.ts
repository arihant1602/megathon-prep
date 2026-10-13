import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, magicLink, organization, twoFactor } from "better-auth/plugins";
import { db, schema } from "./db";
import { sendEmail } from "./email";

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

const appName = process.env.APP_NAME ?? "Megathon";

export const auth = betterAuth({
  appName,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
  socialProviders,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
  plugins: [
    magicLink({
      sendMagicLink: ({ email, url }) => sendEmail({ to: email, subject: `Sign in to ${appName}`, text: `Click to sign in:\n${url}` }).then(() => {}),
    }),
    emailOTP({
      sendVerificationOTP: ({ email, otp }) =>
        sendEmail({ to: email, subject: `${appName} code: ${otp}`, text: `Your one-time code is ${otp}. It expires in 5 minutes.` }).then(() => {}),
    }),
    twoFactor({ issuer: appName }),
    organization({
      sendInvitationEmail: ({ email, organization: org, id }) =>
        sendEmail({
          to: email,
          subject: `Join ${org.name} on ${appName}`,
          text: `You were invited to ${org.name}. Accept here:\n${process.env.BETTER_AUTH_URL}/account?invite=${id}`,
        }).then(() => {}),
    }),
    nextCookies(), // must stay last
  ],
});

export const enabledSocialProviders = Object.keys(socialProviders) as ("github" | "google")[];
export type Session = typeof auth.$Infer.Session;
