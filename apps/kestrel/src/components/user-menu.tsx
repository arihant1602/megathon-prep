"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";
import { signOut } from "@mega/platform/auth-client";

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{email}</span>
      <button
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
        className="inline-flex items-center gap-1.5 rounded-ui border border-line px-3 py-1.5 transition hover:bg-surface"
      >
        <SignOut /> Sign out
      </button>
    </div>
  );
}
