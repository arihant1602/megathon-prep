import { Suspense } from "react";
import { requireSession } from "@mega/platform/server";
import { Talk } from "@/components/talk";

async function Gate() {
  const session = await requireSession();
  return <Talk email={session.user.email} />;
}

export default function TalkPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-96 max-w-3xl animate-pulse rounded-ui bg-line" />}>
      <Gate />
    </Suspense>
  );
}
