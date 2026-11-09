"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { BREAK_GLASS_ENABLED, isLocalAuth } from "@/lib/auth-mode";
import { db } from "@/lib/db";
import { isAdmin, getOwnerId } from "@/lib/owner";
import { requireUser } from "@/lib/session";
import { runAsAdminCreatingUser } from "@/lib/admin-context";
import { placeholderEmail, validateUsername } from "@/lib/identity";
import { PROXY_EMAIL_DOMAIN } from "@/lib/auth-mode";
import type { ActionResult } from "@/actions/inventory";

/**
 * Account management, restricted to the instance owner.
 *
 * Password handling goes through Better Auth rather than touching the
 * database, so hashing stays in one place and matches what sign-in expects.
 */

async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) return null;
  return user;
}

const DENIED: ActionResult = {
  ok: false,
  error: "Only the instance owner can manage accounts.",
};

/** Barback holds no passwords unless it is the one authenticating people. */
const NOT_LOCAL: ActionResult = {
  ok: false,
  error: "This instance does not manage passwords; your reverse proxy does.",
};

function messageFrom(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give them a name.").max(80),
  username: z.string().trim().min(1, "Pick a username for them."),
  email: z.string().trim().toLowerCase().optional(),
  // Blank means "no password": in local mode they cannot sign in until an
  // admin sets one, and behind a proxy they never need one.
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, "Passwords need at least 8 characters."),
});

export async function createUserAccount(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!(await isLocalAuth())) {
    return {
      ok: false,
      error:
        "Accounts are provisioned by your reverse proxy the first time someone signs in.",
    };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name") ?? "",
    username: formData.get("username") ?? "",
    email: String(formData.get("email") ?? "") || undefined,
    password: String(formData.get("password") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const { name, password } = parsed.data;

  const username = validateUsername(parsed.data.username);
  if (!username.ok) return { ok: false, error: username.error };

  let email = parsed.data.email ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That is not a valid email address." };
  }
  if (!email) email = placeholderEmail(username.value, PROXY_EMAIL_DOMAIN);

  const takenUsername = await db.user.findUnique({
    where: { username: username.value },
    select: { id: true },
  });
  if (takenUsername) {
    return { ok: false, error: `The username "${username.value}" is already taken.` };
  }

  const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) return { ok: false, error: `${email} already has an account.` };

  // With no password, store an unguessable one nobody is ever given: the
  // account exists for a reverse proxy to authenticate against, and the owner
  // can set a real password later.
  const withoutPassword = !password;
  const effectivePassword = password ?? randomBytes(32).toString("base64url");

  try {
    await runAsAdminCreatingUser(async () => {
      await auth.api.createUser({
        body: { name, email, password: effectivePassword, role: "user" },
        headers: await headers(),
      });
    });
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not create that account.") };
  }

  // Better Auth does not know about the username column.
  const justCreated = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (justCreated) {
    await db.user.update({
      where: { id: justCreated.id },
      data: { username: username.value },
    });
  }

  if (withoutPassword) {
    // createUser always writes a credential record. Leaving the throwaway
    // password in place would show this account as having password sign-in
    // when nobody can actually use it, so drop it. Setting a password later
    // recreates the record.
    const created = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (created) {
      await db.account.deleteMany({
        where: { userId: created.id, providerId: "credential" },
      });
    }
  }

  revalidatePath("/admin");
  return {
    ok: true,
    error: withoutPassword
      ? (await isLocalAuth())
        // In local mode a passwordless account cannot sign in at all, so say
        // so rather than pointing at a proxy that is not there.
        ? `${username.value} created with no password, so they cannot sign in yet. Set one from this page.`
        : `${username.value} created with no password. They sign in through your reverse proxy.`
      : `${username.value} created. They can sign in with that username or their email.`,
  };
}

const updateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Give them a name.").max(80),
});

export async function updateUserAccount(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;

  const parsed = updateSchema.safeParse({
    userId: formData.get("userId") ?? "",
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  try {
    await auth.api.adminUpdateUser({
      body: { userId: parsed.data.userId, data: { name: parsed.data.name } },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not update that account.") };
  }

  revalidatePath("/admin");
  return { ok: true, error: "Saved." };
}

export async function setUserPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (newPassword.length < 8) {
    return { ok: false, error: "Passwords need at least 8 characters." };
  }

  // Outside local mode Barback does not hold passwords for ordinary people —
  // the proxy does. The exception is an admin arming break-glass access for
  // themselves, which is the whole point of being able to set one here.
  if (!(await isLocalAuth())) {
    if (!BREAK_GLASS_ENABLED) return NOT_LOCAL;

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (target?.role !== "admin") {
      return {
        ok: false,
        error:
          "Only administrators can have a password here; everyone else signs in through the proxy.",
      };
    }
  }

  try {
    await auth.api.setUserPassword({
      body: { userId, newPassword },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not set that password.") };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    error: "Password set.",
  };
}

export async function setUserBanned(
  userId: string,
  banned: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;

  if (userId === admin.id) {
    return { ok: false, error: "You cannot suspend your own account." };
  }
  if (userId === (await getOwnerId())) {
    return { ok: false, error: "The instance owner cannot be suspended." };
  }

  try {
    if (banned) {
      // Also drops their active sessions, so it takes effect immediately.
      await auth.api.banUser({ body: { userId }, headers: await headers() });
    } else {
      await auth.api.unbanUser({ body: { userId }, headers: await headers() });
    }
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not change that account.") };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    error: banned
      ? "Suspended. They cannot sign in, however they reach Barback."
      : "Reinstated.",
  };
}

export async function signOutUserEverywhere(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;

  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: await headers() });
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not revoke those sessions.") };
  }

  revalidatePath("/admin");
  return { ok: true, error: "Signed out of every device." };
}

export async function deleteUserAccount(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;

  if (userId === admin.id) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  if (userId === (await getOwnerId())) {
    return { ok: false, error: "The instance owner cannot be deleted." };
  }

  try {
    // Their inventory, recipes and notes cascade with them.
    await auth.api.removeUser({ body: { userId }, headers: await headers() });
  } catch (error) {
    return { ok: false, error: messageFrom(error, "Could not delete that account.") };
  }

  revalidatePath("/admin");
  return { ok: true, error: "Account deleted, along with its bar and recipes." };
}
