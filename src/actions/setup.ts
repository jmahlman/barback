"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAsAdminCreatingUser } from "@/lib/admin-context";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { placeholderEmail, validateUsername } from "@/lib/identity";
import { PROXY_EMAIL_DOMAIN } from "@/lib/auth-mode";
import type { ActionResult } from "@/actions/inventory";

const schema = z.object({
  name: z.string().trim().min(1, "Tell Barback what to call you.").max(80),
  username: z.string().trim().min(1, "Pick a username."),
  // Optional: a proxy-only instance may have no real address to give, and an
  // invented one is worse than none.
  email: z.string().trim().toLowerCase().optional(),
  password: z.string().min(8, "Use at least 8 characters."),
  confirm: z.string(),
  checkUpdates: z.boolean(),
});

/**
 * Create the first administrator.
 *
 * Only ever works on an instance with no accounts, so it cannot be used to
 * add a second owner later. It goes through Better Auth rather than writing
 * the row directly, so the password is hashed the same way sign-in expects,
 * and the session cookie is set on the way out.
 */
export async function completeSetup(formData: FormData): Promise<ActionResult> {
  if ((await db.user.count()) > 0) {
    return {
      ok: false,
      error: "This instance is already set up. Sign in instead.",
    };
  }

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    username: formData.get("username") ?? "",
    email: String(formData.get("email") ?? "") || undefined,
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
    // Unticked means off: the box is the only way this gets switched on.
    checkUpdates: formData.get("checkUpdates") === "on",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message,
      fieldErrors: { [String(first?.path[0] ?? "form")]: first?.message ?? "" },
    };
  }

  const { name, password, confirm } = parsed.data;

  const username = validateUsername(parsed.data.username);
  if (!username.ok) {
    return {
      ok: false,
      error: username.error,
      fieldErrors: { username: username.error ?? "" },
    };
  }

  // No email given: store a clearly-generated one so the unique key the rest
  // of the schema relies on still holds.
  let email = parsed.data.email ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      error: "That does not look like an email address.",
      fieldErrors: { email: "That does not look like an email address." },
    };
  }
  if (!email) email = placeholderEmail(username.value, PROXY_EMAIL_DOMAIN);

  if (password !== confirm) {
    return {
      ok: false,
      error: "Those passwords do not match.",
      fieldErrors: { confirm: "Those passwords do not match." },
    };
  }

  try {
    // Exempt from the closed-signups guard: this IS the owner being created.
    await runAsAdminCreatingUser(async () => {
      await auth.api.signUpEmail({
        body: { name, email, password },
        headers: await headers(),
      });
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "body" in error
        ? ((error as { body?: { message?: string } }).body?.message ?? null)
        : null;
    return { ok: false, error: message ?? "Could not create that account." };
  }

  // The create hook promotes the first account; make certain of it, because
  // everything about owning this instance hangs off the role. The username
  // is attached here because Better Auth does not know about that column.
  const created = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (created) {
    await db.user.update({
      where: { id: created.id },
      data: {
        username: username.value,
        ...(created.role === "admin" ? {} : { role: "admin" }),
      },
    });
  }

  await setSetting(
    SETTING_KEYS.updateCheck,
    parsed.data.checkUpdates ? "true" : "false",
  );

  revalidatePath("/", "layout");
  return { ok: true };
}
