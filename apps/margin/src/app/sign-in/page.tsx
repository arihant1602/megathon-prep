import { enabledSocialProviders } from "@mega/platform/auth";
import { AuthForm } from "@mega/platform/ui/auth-form";
import { Logo } from "@/components/logo";

export default function SignIn() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4 py-16">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your documents</h1>
        <p className="mt-2 text-muted">Collaborators need an account too, so you can share by email.</p>
      </div>
      <AuthForm providers={enabledSocialProviders} redirectTo="/docs" />
    </main>
  );
}
