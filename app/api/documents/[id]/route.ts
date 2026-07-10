import { NextResponse } from "next/server";
import { auth, requireDocumentAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateDocumentSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const role = await requireDocumentAccess(id, session.user.id);
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const operations = await prisma.operation.findMany({
      where: { documentId: id },
      orderBy: [{ clock: "asc" }, { clientId: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ document, role, operations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDocumentAccess(id, session.user.id, "EDITOR");
    const body = await request.json();
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const document = await prisma.document.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDocumentAccess(id, session.user.id, "OWNER");
    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
