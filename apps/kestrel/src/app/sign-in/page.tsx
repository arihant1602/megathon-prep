import { enabledSocialProviders } from "@mega/platform/auth";
import { AuthForm } from "@mega/platform/ui/auth-form";
import { Logo } from "@/components/logo";

export default function SignIn() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4 py-16">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to the console</h1>
        <p className="mt-2 text-muted">One account works across all four Megathon apps.</p>
      </div>
      <AuthForm providers={enabledSocialProviders} redirectTo="/console" />
    </main>
  );
}
