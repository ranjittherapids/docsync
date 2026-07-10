import { NextResponse } from "next/server";
import { auth, requireDocumentAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createVersionSchema,
  restoreVersionSchema,
} from "@/lib/validation";
import { computeDiff } from "@/lib/operations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  try {
    await requireDocumentAccess(documentId, session.user.id);
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ versions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const { documentId, label, content: clientContent } = parsed.data;

  try {
    await requireDocumentAccess(documentId, session.user.id, "EDITOR");
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Prefer the live editor content so snapshots aren't empty/stale
    const snapshotContent =
      typeof clientContent === "string" ? clientContent : document.content;

    // Keep server document in sync with what the user actually saved
    if (
      typeof clientContent === "string" &&
      clientContent !== document.content
    ) {
      await prisma.document.update({
        where: { id: documentId },
        data: { content: clientContent },
      });
    }

    const version = await prisma.documentVersion.create({
      data: {
        documentId,
        userId: session.user.id,
        label,
        content: snapshotContent,
        clock: document.clock,
      },
      include: { user: { select: { name: true, email: true } } },
    });

    return NextResponse.json(version);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = restoreVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: parsed.data.versionId },
    });
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    await requireDocumentAccess(version.documentId, session.user.id, "EDITOR");

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({
        where: { id: version.documentId },
      });
      if (!document) {
        throw new Error("Document not found");
      }

      // Auto-backup current state before restore
      await tx.documentVersion.create({
        data: {
          documentId: version.documentId,
          userId: session.user!.id!,
          label: `Before restore to "${version.label}"`,
          content: document.content,
          clock: document.clock,
        },
      });

      const clientId = `restore-${session.user!.id}`;
      const ops = computeDiff(document.content, version.content, {
        documentId: version.documentId,
        userId: session.user!.id!,
        clientId,
        clock: document.clock,
      });

      const agg = await tx.operation.aggregate({
        where: { documentId: version.documentId },
        _max: { seq: true },
      });
      let nextSeq = agg._max.seq ?? 0;

      if (ops.length > 0) {
        for (const op of ops) {
          nextSeq += 1;
          await tx.operation.create({
            data: {
              id: op.id,
              documentId: op.documentId,
              userId: op.userId,
              clientId: op.clientId,
              clock: op.clock,
              seq: nextSeq,
              type: op.type,
              position: op.position,
              content: op.content,
              length: op.length,
              createdAt: new Date(op.createdAt),
            },
          });
        }
      }

      const updated = await tx.document.update({
        where: { id: version.documentId },
        data: { content: version.content, clock: nextSeq },
      });

      // Return full operation history so the client can reset local state
      const allOperations = await tx.operation.findMany({
        where: { documentId: version.documentId },
        orderBy: [{ clock: "asc" }, { clientId: "asc" }, { id: "asc" }],
      });

      return { document: updated, operations: ops, allOperations };
    });

    return NextResponse.json({
      document: result.document,
      operations: result.operations,
      allOperations: result.allOperations.map((op) => ({
        ...op,
        createdAt: op.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed";
    const status = message === "Document not found" ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
