import { Suspense } from "react";
import { requireSession } from "@mega/platform/server";
import { Lab } from "@/components/lab";

async function Gate() {
  const session = await requireSession();
  return <Lab email={session.user.email} />;
}

export default function LabPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-96 max-w-6xl animate-pulse rounded-ui bg-line" />}>
      <Gate />
    </Suspense>
  );
}
