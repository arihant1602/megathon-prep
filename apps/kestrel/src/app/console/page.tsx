import { Suspense } from "react";
import { requireSession } from "@mega/platform/server";
import { Logo } from "@/components/logo";
import { Console } from "@/components/console";
import { UserMenu } from "@/components/user-menu";

async function User() {
  const session = await requireSession();
  return <UserMenu email={session.user.email} />;
}

export default function ConsolePage() {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <Logo />
          <Suspense fallback={<span className="h-5 w-40 animate-pulse rounded-ui bg-line" />}>
            <User />
          </Suspense>
        </div>
      </header>
      <Console />
    </div>
  );
}
