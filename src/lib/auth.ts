import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { isAdminCreatingUser } from "@/lib/admin-context";
import { getAuthMode } from "@/lib/auth-mode";
import { db } from "@/lib/db";
import { normaliseUsername } from "@/lib/identity";

/**
 * Barback's own email-and-password authentication.
 *
 * Only used when AUTH_MODE is "local". In "proxy" mode the identity comes
 * from the reverse proxy and in "none" mode there is no sign-in at all; see
 * src/lib/session.ts, which decides between them.
 */

/**
 * Whether anyone may create their own account.
 *
 * Read per request, because it is togglable from the Settings page. The
 * environment variable remains the initial value for a new instance.
 */
export async function signupsAllowed(): Promise<boolean> {
  const { getSetting, SETTING_KEYS } = await import("@/lib/settings");
  return (await getSetting(SETTING_KEYS.allowSignups)) !== "false";
}

/**
 * In proxy and none modes Barback issues no sessions of its own, so there is
 * no secret to configure — but the instance is still constructed, and it
 * refuses to build without one. A throwaway per-process value keeps it quiet
 * without pretending a real secret exists. The entrypoint still requires a
 * proper secret in local mode.
 */
function sessionSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  console.warn(
    "[auth] BETTER_AUTH_SECRET is not set. Password sign-in cannot be used, " +
      "and switching to local mode is blocked until it is configured.",
  );
  return randomBytes(32).toString("base64");
}

export function baseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const auth = betterAuth({
  appName: "Barback",
  baseURL: baseUrl(),
  secret: sessionSecret(),
  database: prismaAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Self-hosted instances usually have no mail server; keep it simple.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
    // The cookie cache is deliberately off. It serves the session from a
    // signed cookie without consulting the database, which means suspending
    // or deleting someone leaves them working for however long the cache
    // lasts. Against SQLite a session lookup is one indexed read, so the
    // trade is not worth it: when the owner cuts off access it takes effect
    // on the next request.
    cookieCache: { enabled: false },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (candidate) => {
          // Only guards Barback's own sign-up. Accounts provisioned from
          // proxy headers are governed by the proxy, and the owner adding
          // someone from the admin panel is exempt.
          if (isAdminCreatingUser()) return;
          if ((await getAuthMode()) !== "local") return;
          if (await signupsAllowed()) return;

          const existing = await db.user.findUnique({
            where: { email: candidate.email },
            select: { id: true },
          });
          if (existing) return;

          throw new APIError("FORBIDDEN", {
            message:
              "Signups are closed on this instance. Ask the owner for an account.",
          });
        },
        after: async (created) => {
          const patch: { role?: string; username?: string } = {};

          // The first account to exist owns the instance.
          if ((await db.user.count()) === 1) patch.role = "admin";

          // Better Auth does not know about usernames, so accounts made
          // through its own sign-up arrive without one. Derive a handle from
          // the email so every account is matchable by a reverse proxy
          // later, and so sign-in by username works for everyone.
          const existing = await db.user.findUnique({
            where: { id: created.id },
            select: { username: true, email: true },
          });
          if (existing && !existing.username) {
            const base = normaliseUsername(existing.email.split("@")[0]) || "user";
            let candidate = base;
            for (let n = 2; n < 50; n += 1) {
              const taken = await db.user.findUnique({
                where: { username: candidate },
                select: { id: true },
              });
              if (!taken) break;
              candidate = `${base}${n}`;
            }
            patch.username = candidate;
          }

          if (Object.keys(patch).length > 0) {
            await db.user.update({ where: { id: created.id }, data: patch });
          }
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      defaultBanReason: "Suspended by the instance owner",
    }),
    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
