import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSetupComplete } from "@/lib/setup";
import {
  isPlaceholderEmail,
  normalizeUsername,
  placeholderEmail,
} from "@/lib/identity";
import {
  BREAK_GLASS_ENABLED,
  getAuthMode,
  PROXY_ADMIN_GROUP,
  PROXY_EMAIL_DOMAIN,
  PROXY_HEADERS,
  PROXY_SHARED_SECRET,
  SINGLE_USER_EMAIL,
  SINGLE_USER_NAME,
} from "@/lib/auth-mode";

/**
 * Resolving who is making a request, for whichever authentication mode this
 * instance runs in. Everything else in the app goes through `requireUser`
 * and does not care which mode is active.
 */

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  banned: boolean;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Why a proxy-authenticated request was turned away.
 *
 * Logged with the names of the headers that did arrive, because the usual
 * cause is a proxy that is not forwarding them at all, and from the browser
 * that is indistinguishable from being signed out. Names only: the values
 * carry someone's identity and do not belong in the log.
 */
function rejectProxy(reason: string, incoming?: Headers): null {
  let seen = "";
  if (incoming) {
    const expected = [
      PROXY_HEADERS.user,
      PROXY_HEADERS.email,
      PROXY_HEADERS.name,
      PROXY_HEADERS.groups,
      PROXY_HEADERS.secret,
    ];
    const present = expected.filter((header) => incoming.has(header));
    seen = present.length
      ? ` (received: ${present.join(", ")})`
      : " (none of the expected headers were present — check that your proxy forwards them)";
  }
  console.warn(`[auth] proxy request rejected: ${reason}${seen}`);
  return null;
}

async function resolveProxyUser(): Promise<CurrentUser | null> {
  const incoming = await headers();

  // The shared secret, when configured, is checked before anything else is
  // read, so a request that bypassed the proxy never reaches provisioning.
  if (PROXY_SHARED_SECRET) {
    const presented = incoming.get(PROXY_HEADERS.secret) ?? "";
    if (!presented || !constantTimeEquals(presented, PROXY_SHARED_SECRET)) {
      return rejectProxy(
        presented
          ? `the ${PROXY_HEADERS.secret} header did not match AUTH_PROXY_SHARED_SECRET`
          : `AUTH_PROXY_SHARED_SECRET is set but no ${PROXY_HEADERS.secret} header arrived`,
        incoming,
      );
    }
  }

  const username = normalizeUsername(incoming.get(PROXY_HEADERS.user) ?? "");
  const emailHeader = incoming.get(PROXY_HEADERS.email)?.trim().toLowerCase() ?? "";
  const displayName = incoming.get(PROXY_HEADERS.name)?.trim() ?? "";
  const groups = (incoming.get(PROXY_HEADERS.groups) ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  if (!username && !emailHeader) {
    // Quiet when nothing proxy-shaped arrived at all: that is someone
    // reaching the app directly, which break-glass handles next.
    const sawAnything =
      incoming.has(PROXY_HEADERS.secret) || incoming.has(PROXY_HEADERS.groups);
    if (!sawAnything) return null;
    return rejectProxy(
      `neither ${PROXY_HEADERS.user} nor ${PROXY_HEADERS.email} was present`,
      incoming,
    );
  }

  const shouldBeAdmin = Boolean(PROXY_ADMIN_GROUP) && groups.includes(PROXY_ADMIN_GROUP);

  // Username first. It is what a proxy reliably sends, and matching on it
  // keeps one person as one account even when their email changes or was
  // never supplied in the first place.
  const existing =
    (username
      ? await db.user.findUnique({ where: { username } })
      : null) ??
    (emailHeader ? await db.user.findUnique({ where: { email: emailHeader } }) : null);

  if (existing) {
    if (existing.banned) {
      return rejectProxy(`${existing.username ?? existing.email} is suspended`);
    }

    const patch: {
      name?: string;
      role?: string;
      username?: string;
      email?: string;
    } = {};

    // Only when the proxy actually sends a display name. Falling back to the
    // username would quietly replace "John Mahlman" with "john".
    if (displayName && displayName !== existing.name) patch.name = displayName;

    // Adopt the username the first time a proxy supplies one, so an account
    // created locally before the switch becomes matchable.
    if (username && existing.username !== username) {
      const clash = await db.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!clash || clash.id === existing.id) patch.username = username;
    }

    // Replace a generated address once a real one turns up. Without this the
    // account would keep a fake email forever.
    if (
      emailHeader &&
      emailHeader !== existing.email &&
      isPlaceholderEmail(existing.email, PROXY_EMAIL_DOMAIN)
    ) {
      const clash = await db.user.findUnique({
        where: { email: emailHeader },
        select: { id: true },
      });
      if (!clash || clash.id === existing.id) patch.email = emailHeader;
    }

    if (PROXY_ADMIN_GROUP) {
      const nextRole = shouldBeAdmin ? "admin" : "user";
      // Never demote the last admin out of existence.
      if (nextRole !== existing.role) {
        if (nextRole === "admin") {
          patch.role = "admin";
        } else {
          const otherAdmins = await db.user.count({
            where: { role: "admin", id: { not: existing.id } },
          });
          if (otherAdmins > 0) patch.role = "user";
        }
      }
    }

    const user =
      Object.keys(patch).length > 0
        ? await db.user.update({ where: { id: existing.id }, data: patch })
        : existing;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role ?? "user",
      banned: false,
    };
  }

  // First time we have seen this person: provision them.
  const email =
    emailHeader || placeholderEmail(username, PROXY_EMAIL_DOMAIN);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    return rejectProxy(`"${email}" is not a usable email address`);
  }

  const isFirstUser = (await db.user.count()) === 0;
  const created = await db.user.create({
    data: {
      id: crypto.randomUUID(),
      name: displayName || username || email.split("@")[0],
      email,
      username: username || null,
      emailVerified: Boolean(emailHeader),
      role: isFirstUser || shouldBeAdmin ? "admin" : "user",
    },
  });

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    username: created.username,
    role: created.role ?? "user",
    banned: false,
  };
}

/**
 * With authentication off, everyone is one account.
 *
 * That account is the instance owner when there already is one. Minting a
 * fresh placeholder instead would hide every bottle and recipe the owner has
 * entered — they belong to a different row — which looks exactly like data
 * loss and is the obvious trap when switching modes. The placeholder is only
 * created on an instance that has no accounts at all.
 */
async function resolveSingleUser(): Promise<CurrentUser> {
  const owner =
    (await db.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
    })) ?? (await db.user.findFirst({ orderBy: { createdAt: "asc" } }));

  if (owner) {
    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      username: owner.username,
      role: "admin",
      banned: false,
    };
  }

  const created = await db.user.create({
    data: {
      id: crypto.randomUUID(),
      name: SINGLE_USER_NAME,
      email: SINGLE_USER_EMAIL,
      username: normalizeUsername(SINGLE_USER_NAME) || "owner",
      emailVerified: true,
      role: "admin",
    },
  });
  return {
    id: created.id,
    name: created.name,
    email: created.email,
    username: created.username,
    role: "admin",
    banned: false,
  };
}

async function resolveLocalUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };

  if (user.banned) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? null,
    role: user.role ?? "user",
    banned: false,
  };
}

/**
 * Break-glass: an admin signing in with a password while the instance is in
 * proxy or none mode. Everyone else must come through the configured route.
 */
async function resolveBreakGlassAdmin(): Promise<CurrentUser | null> {
  if (!BREAK_GLASS_ENABLED) return null;

  const user = await resolveLocalUser();
  if (!user) return null;

  if (user.role !== "admin") {
    console.warn(
      `[auth] refused a password session for ${user.email}: break-glass access is for admins only.`,
    );
    return null;
  }

  return user;
}

/**
 * True when this request is authenticated by a Barback password session
 * rather than by the proxy. Break-glass admins need a way to sign out, and
 * the button is otherwise hidden outside local mode.
 */
export const hasPasswordSession = cache(async (): Promise<boolean> => {
  const mode = await getAuthMode();
  if (mode === "local") return true;
  if (mode === "none") return false;
  return (await resolveLocalUser()) !== null;
});

/** The current user, or null. Resolved once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  switch (await getAuthMode()) {
    case "proxy": {
      const viaProxy = await resolveProxyUser();
      if (viaProxy) return viaProxy;
      // No identity from the proxy. This is the direct-access case the
      // break-glass admin exists for.
      return resolveBreakGlassAdmin();
    }
    case "none":
      return resolveSingleUser();
    default:
      return resolveLocalUser();
  }
});

/**
 * Kept for the places that only need to know whether anyone is signed in.
 * Shaped like Better Auth's session so existing call sites read the same.
 */
export const getSession = cache(async () => {
  const user = await getCurrentUser();
  return user ? { user } : null;
});

/** The current user, or a redirect to sign-in — or to first-run setup. */
export async function requireUser(): Promise<CurrentUser> {
  // The setup gate comes before any mode, so the first account on a new
  // instance is always the local administrator, even when the instance is
  // configured for proxy or none.
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
