"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { looksLikeEmail, normalizeUsername } from "@/lib/identity";
import type { ActionResult } from "@/actions/inventory";

/**
 * Sign in with either a username or an email address.
 *
 * The lookup happens here rather than in the browser on purpose: resolving a
 * username to an account client-side would tell anyone which usernames
 * exist. Every failure returns the same message.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<ActionResult> {
  const raw = identifier.trim();
  if (!raw || !password) {
    return { ok: false, error: "Enter your username or email, and your password." };
  }

  const generic = {
    ok: false as const,
    error: "That username or password is not right.",
  };

  let email = raw.toLowerCase();

  if (!looksLikeEmail(raw)) {
    const username = normalizeUsername(raw);
    if (!username) return generic;

    const found = await db.user.findUnique({
      where: { username },
      select: { email: true },
    });
    // Deliberately the same message as a wrong password.
    if (!found) return generic;
    email = found.email;
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "body" in error
        ? (error as { body?: { code?: string; message?: string } }).body
        : null;

    // Suspension is worth saying out loud; everything else stays generic.
    if (code?.code === "BANNED_USER") {
      return { ok: false, error: code.message ?? "That account is suspended." };
    }
    return generic;
  }

  return { ok: true };
}
