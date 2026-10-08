"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "../auth-client";

type Provider = "github" | "google";

/**
 * Email/password + social sign-in. Styled with each app's design tokens
 * (bg-surface, border-line, text-muted, bg-accent, text-accent-fg, rounded-ui).
 */
export function AuthForm({ providers, redirectTo }: { providers: Provider[]; redirectTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(form: FormData) {
    setPending(true);
    setError(null);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const res =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(form.get("name") || email.split("@")[0]) });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong. Try again.");
    router.push(redirectTo);
    router.refresh();
  }

  const field = "flex flex-col gap-2 text-sm font-medium";
  const input =
    "rounded-ui border border-line bg-surface px-3 py-2.5 text-base text-fg outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <div className="flex flex-col gap-5">
      <form action={onSubmit} className="flex flex-col gap-4">
        {mode === "up" && (
          <label className={field}>
            Name
            <input name="name" autoComplete="name" className={input} />
          </label>
        )}
        <label className={field}>
          Email
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className={field}>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className={input}
          />
          <span className="text-xs font-normal text-muted">At least 8 characters.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-ui bg-accent px-4 py-2.5 font-medium text-accent-fg transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Please wait" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {providers.map((p) => (
        <button
          key={p}
          onClick={() => signIn.social({ provider: p, callbackURL: redirectTo })}
          className="rounded-ui border border-line px-4 py-2.5 font-medium transition hover:bg-surface active:scale-[0.98]"
        >
          Continue with {p === "github" ? "GitHub" : "Google"}
        </button>
      ))}
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm text-muted underline underline-offset-4">
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
