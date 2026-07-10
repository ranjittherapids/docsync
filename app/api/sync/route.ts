import { NextResponse } from "next/server";
import { auth, canSync, requireDocumentAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  rebuildContent,
  MAX_CONTENT_LENGTH,
  type DocumentOperation,
} from "@/lib/operations";
import {
  parseJsonSafely,
  syncPushSchema,
  syncPullSchema,
  validatePayloadSize,
} from "@/lib/validation";

/**
 * Pull remote operations using server-assigned `seq` (not client Lamport clocks).
 * `sinceClock` query param is treated as `sinceSeq` for backwards compatibility.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = syncPullSchema.safeParse({
    documentId: searchParams.get("documentId"),
    sinceClock: Number(searchParams.get("sinceClock") ?? 0),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const { documentId, sinceClock: sinceSeq } = parsed.data;

  try {
    await requireDocumentAccess(documentId, session.user.id);

    const operations = await prisma.operation.findMany({
      where: { documentId, seq: { gt: sinceSeq } },
      orderBy: [{ seq: "asc" }, { clock: "asc" }, { clientId: "asc" }, { id: "asc" }],
      take: 500,
    });

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { content: true, clock: true, title: true, updatedAt: true },
    });

    return NextResponse.json({
      operations: operations.map((op) => ({
        id: op.id,
        documentId: op.documentId,
        userId: op.userId,
        clientId: op.clientId,
        clock: op.clock,
        seq: op.seq,
        type: op.type,
        position: op.position,
        content: op.content,
        length: op.length,
        createdAt: op.createdAt.toISOString(),
      })),
      document,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

/** Push local operations — server assigns global `seq` for reliable multi-client sync */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = request.headers.get("content-length");
  if (!validatePayloadSize(contentLength ? Number(contentLength) : null)) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseJsonSafely(body, syncPushSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { documentId, operations } = parsed.data;

  try {
    const role = await requireDocumentAccess(documentId, session.user.id);
    if (!canSync(role)) {
      return NextResponse.json(
        { error: "Viewers cannot push changes" },
        { status: 403 }
      );
    }

    for (const op of operations) {
      if (op.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Operation user mismatch" },
          { status: 403 }
        );
      }
      if (op.documentId !== documentId) {
        return NextResponse.json(
          { error: "Operation document mismatch" },
          { status: 400 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.operation.findMany({
        where: {
          documentId,
          id: { in: operations.map((o) => o.id) },
        },
      });
      const existingIds = new Set(existing.map((o) => o.id));
      const newOps = operations.filter((o) => !existingIds.has(o.id));

      const agg = await tx.operation.aggregate({
        where: { documentId },
        _max: { seq: true },
      });
      let nextSeq = agg._max.seq ?? 0;

      if (newOps.length > 0) {
        for (const op of newOps) {
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

      const allOps = await tx.operation.findMany({
        where: { documentId },
        orderBy: [{ clock: "asc" }, { clientId: "asc" }, { id: "asc" }],
      });

      const mapped: DocumentOperation[] = allOps.map((op) => ({
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

      const content = rebuildContent(mapped);
      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error("Document exceeds maximum size");
      }

      // document.clock stores the global sync cursor (max seq)
      const document = await tx.document.update({
        where: { id: documentId },
        data: { content, clock: nextSeq },
      });

      return { document, appliedCount: newOps.length, syncCursor: nextSeq };
    });

    return NextResponse.json({
      success: true,
      appliedCount: result.appliedCount,
      document: result.document,
      syncCursor: result.syncCursor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
