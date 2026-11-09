import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * The instance owner holds the "admin" role, granted to the first account
 * created here. That covers an account made with a password and one created
 * from a reverse proxy's headers the first time it saw that person.
 *
 * The earliest account is still honoured as a fallback, so an instance whose
 * roles were never written stays manageable.
 */
export const getOwnerId = cache(async (): Promise<string | null> => {
  const admin = await db.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin) return admin.id;

  const first = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
});

export async function isOwner(userId: string): Promise<boolean> {
  return (await getOwnerId()) === userId;
}

/** Admins may manage other accounts. Today that is exactly the owner. */
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "admin") return true;
  return isOwner(userId);
}
