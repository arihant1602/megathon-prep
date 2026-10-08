import { Suspense } from "react";
import { requireSession } from "@mega/platform/server";
import { DocList } from "@/components/doc-list";
import { Logo } from "@/components/logo";

async function Gate() {
  const session = await requireSession();
  return <DocList email={session.user.email} />;
}

export default function DocsPage() {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 md:px-8">
          <Logo />
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto mt-10 h-64 max-w-4xl animate-pulse rounded-ui bg-line" />}>
        <Gate />
      </Suspense>
    </div>
  );
}
