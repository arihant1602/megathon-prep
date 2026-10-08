import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@mega/platform/db";
import { requireSession } from "@mega/platform/server";
import { DocEditor } from "@/components/doc-editor";
import { getRole } from "@/lib/access";

async function Load({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const role = await getRole(id, session.user.id);
  if (!role) notFound();
  const [doc] = await db.select({ title: schema.document.title }).from(schema.document).where(eq(schema.document.id, id));
  return <DocEditor id={id} initialTitle={doc.title} role={role} user={{ id: session.user.id, name: session.user.name || session.user.email }} />;
}

export default function DocPage(props: PageProps<"/docs/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-96 max-w-3xl animate-pulse rounded-ui bg-line" />}>
      <Load params={props.params} />
    </Suspense>
  );
}
