import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentEditor } from "@/components/document-editor";
import type { DocumentOperation } from "@/lib/operations";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const membership = await prisma.documentMember.findUnique({
    where: {
      documentId_userId: { documentId: id, userId: session.user.id },
    },
    include: { document: true },
  });

  if (!membership) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Document not found</h1>
          <Link href="/dashboard" className="mt-2 text-indigo-600 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const operations = await prisma.operation.findMany({
    where: { documentId: id },
    orderBy: [{ clock: "asc" }, { clientId: "asc" }, { id: "asc" }],
  });

  const serverOps: DocumentOperation[] = operations.map((op) => ({
    id: op.id,
    documentId: op.documentId,
    userId: op.userId,
    clientId: op.clientId,
    clock: op.clock,
    type: op.type as "insert" | "delete",
    position: op.position,
    content: op.content,
    length: op.length,
    createdAt: op.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Dashboard
        </Link>
      </header>
      <DocumentEditor
        documentId={id}
        userId={session.user.id}
        initialTitle={membership.document.title}
        initialContent={membership.document.content}
        initialClock={membership.document.clock}
        role={membership.role}
        serverOps={serverOps}
      />
    </div>
  );
}
