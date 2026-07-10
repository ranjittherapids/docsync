import { NextResponse } from "next/server";
import { auth, requireDocumentAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inviteMemberSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/** List document members — any member can view */
export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDocumentAccess(id, session.user.id);
    const members = await prisma.documentMember.findMany({
      where: { documentId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

/** Invite a user by email — Owner only */
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDocumentAccess(id, session.user.id, "OWNER");

    const body = await request.json();
    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email. They must register first." },
        { status: 404 }
      );
    }

    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "You already own this document" },
        { status: 400 }
      );
    }

    const member = await prisma.documentMember.upsert({
      where: {
        documentId_userId: { documentId: id, userId: user.id },
      },
      create: {
        documentId: id,
        userId: user.id,
        role,
      },
      update: { role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invite failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

/** Update or remove a member — Owner only */
export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDocumentAccess(id, session.user.id, "OWNER");
    const body = await request.json();
    const { userId, role, remove } = body as {
      userId?: string;
      role?: "EDITOR" | "VIEWER";
      remove?: boolean;
    };

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const target = await prisma.documentMember.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
    });

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot modify the document owner" },
        { status: 400 }
      );
    }

    if (remove) {
      await prisma.documentMember.delete({
        where: { documentId_userId: { documentId: id, userId } },
      });
      return NextResponse.json({ success: true });
    }

    if (!role || !["EDITOR", "VIEWER"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const member = await prisma.documentMember.update({
      where: { documentId_userId: { documentId: id, userId } },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
