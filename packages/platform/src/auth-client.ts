import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    emailOTPClient(),
    organizationClient(),
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign("/sign-in?step=2fa") }),
  ],
});
export const { signIn, signUp, signOut, useSession } = authClient;
