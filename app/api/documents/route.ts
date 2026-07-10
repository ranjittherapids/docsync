import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDocumentSchema } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.documentMember.findMany({
    where: { userId: session.user.id },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          content: true,
          clock: true,
          updatedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { document: { updatedAt: "desc" } },
  });

  const documents = memberships.map((m) => ({
    ...m.document,
    role: m.role,
  }));

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const document = await prisma.document.create({
    data: {
      title: parsed.data.title,
      members: {
        create: {
          userId: session.user.id,
          role: "OWNER",
        },
      },
    },
  });

  return NextResponse.json({
    ...document,
    role: "OWNER" as const,
  });
}
