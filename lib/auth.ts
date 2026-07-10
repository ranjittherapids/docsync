import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "./prisma";
import { registerSchema } from "./validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
});

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
}) {
  const parsed = registerSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  return prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
    },
  });
}

export type Role = "OWNER" | "EDITOR" | "VIEWER";

export async function getDocumentRole(
  documentId: string,
  userId: string
): Promise<Role | null> {
  const member = await prisma.documentMember.findUnique({
    where: { documentId_userId: { documentId, userId } },
  });
  return member?.role ?? null;
}

export async function requireDocumentAccess(
  documentId: string,
  userId: string,
  minRole: Role = "VIEWER"
): Promise<Role> {
  const role = await getDocumentRole(documentId, userId);
  if (!role) throw new Error("Access denied");

  const hierarchy: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
  if (hierarchy[role] < hierarchy[minRole]) {
    throw new Error("Insufficient permissions");
  }
  return role;
}

export function canEdit(role: Role): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canSync(role: Role): boolean {
  return role !== "VIEWER";
}
