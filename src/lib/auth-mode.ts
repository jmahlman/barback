import "server-only";
import { db } from "@/lib/db";

/**
 * How people get into this instance.
 *
 *  local  — Barback's own email and password. The default.
 *  proxy  — a reverse proxy in front (Authelia, Authentik, Traefik
 *           forward-auth, oauth2-proxy, Caddy) has already authenticated the
 *           request and passes the identity in headers.
 *  none   — no authentication at all. Everyone who can reach the app is the
 *           same single user. For a private network, and nothing else.
 */
export type AuthMode = "local" | "proxy" | "none";

export const AUTH_MODES: AuthMode[] = ["local", "proxy", "none"];

export function isAuthMode(value: string): value is AuthMode {
  return value === "local" || value === "proxy" || value === "none";
}

/** Setting key. Declared here to avoid a cycle with the settings module. */
export const AUTH_MODE_SETTING = "auth.mode";

/**
 * AUTH_MODE from the environment, when it is set to something usable.
 *
 * This one setting is deliberately the opposite of the others: the
 * environment WINS over the database. Picking the wrong mode is the one
 * change that can lock the owner out of their own instance, and an
 * environment variable is the recovery path that is always available without
 * a working login. When it is set the dropdown is read-only and says so.
 */
export const AUTH_MODE_ENV: AuthMode | null = (() => {
  const raw = (process.env.AUTH_MODE ?? "").trim().toLowerCase();
  return isAuthMode(raw) ? raw : null;
})();

export const AUTH_MODE_LOCKED = AUTH_MODE_ENV !== null;

/** The mode in force right now. Resolved per request, so changes are live. */
export async function getAuthMode(): Promise<AuthMode> {
  if (AUTH_MODE_ENV) return AUTH_MODE_ENV;

  try {
    const row = await db.appSetting.findUnique({
      where: { key: AUTH_MODE_SETTING },
    });
    const stored = row?.value?.trim().toLowerCase() ?? "";
    if (isAuthMode(stored)) return stored;
  } catch {
    // A database that is not ready yet must not lock everyone out of a
    // password login; fall back to the safe default.
  }
  return "local";
}

export async function isLocalAuth(): Promise<boolean> {
  return (await getAuthMode()) === "local";
}

export async function isProxyAuth(): Promise<boolean> {
  return (await getAuthMode()) === "proxy";
}

export async function isNoAuth(): Promise<boolean> {
  return (await getAuthMode()) === "none";
}

/** Header names, overridable because every proxy names them differently. */
export const PROXY_HEADERS = {
  user: (process.env.AUTH_PROXY_USER_HEADER ?? "Remote-User").toLowerCase(),
  email: (process.env.AUTH_PROXY_EMAIL_HEADER ?? "Remote-Email").toLowerCase(),
  name: (process.env.AUTH_PROXY_NAME_HEADER ?? "Remote-Name").toLowerCase(),
  groups: (process.env.AUTH_PROXY_GROUPS_HEADER ?? "Remote-Groups").toLowerCase(),
  secret: (
    process.env.AUTH_PROXY_SECRET_HEADER ?? "X-Barback-Proxy-Secret"
  ).toLowerCase(),
};

/**
 * Shared secret the proxy must send.
 *
 * Header-based identity is only as trustworthy as the guarantee that nothing
 * can reach the app except through the proxy. Network isolation is the real
 * control, but it is easy to get wrong — a published port, a second network
 * on the container — and the failure is silent and total: anyone who can
 * reach the app sets `Remote-User` to whatever they like.
 *
 * This secret turns that into a second lock that does not depend on getting
 * the network right. It is optional so a correctly isolated setup is not
 * blocked, but it is strongly recommended and the app says so.
 */
export const PROXY_SHARED_SECRET = (process.env.AUTH_PROXY_SHARED_SECRET ?? "").trim();

/** Members of this group are made instance admins. Empty disables the mapping. */
export const PROXY_ADMIN_GROUP = (process.env.AUTH_PROXY_ADMIN_GROUP ?? "").trim();

/**
 * Domain used to synthesise an address when the proxy sends a username but no
 * email. Accounts are keyed on email, so there has to be one.
 */
export const PROXY_EMAIL_DOMAIN = (
  process.env.AUTH_PROXY_EMAIL_DOMAIN ?? "proxy.local"
).trim();

/** Only used on an instance that has no accounts at all. */
export const SINGLE_USER_EMAIL = (
  process.env.SINGLE_USER_EMAIL ?? "you@barback.local"
).trim();

export const SINGLE_USER_NAME = (process.env.SINGLE_USER_NAME ?? "You").trim();

/** Whether Barback can sign its own sessions. Local mode needs this. */
export const HAS_SESSION_SECRET = Boolean(process.env.BETTER_AUTH_SECRET?.trim());

/**
 * Break-glass access: let an instance admin sign in with a password even when
 * the instance is running in proxy or none mode.
 *
 * The reason is the obvious one — reaching the app at its address directly
 * when the proxy is down, misconfigured, or you are on the LAN rather than
 * coming in through the subdomain. Without it, a broken proxy means nobody
 * can get in at all and the only fix is editing environment variables.
 *
 * It is deliberately narrow:
 *   - only accounts with the admin role may use it, never ordinary users;
 *   - it does nothing until an admin actually has a password set, so a
 *     fresh proxy-only instance has no password surface at all;
 *   - it is reported on the People and Settings pages, so it cannot be on
 *     without the owner knowing.
 *
 * Set AUTH_LOCAL_ADMIN_FALLBACK=false to switch it off entirely.
 */
export const BREAK_GLASS_ENABLED =
  (process.env.AUTH_LOCAL_ADMIN_FALLBACK ?? "true").trim().toLowerCase() !== "false";

export function describeMode(mode: AuthMode): string {
  switch (mode) {
    case "proxy":
      return "Identity comes from your reverse proxy.";
    case "none":
      return "Authentication is switched off. Everyone is the same user.";
    default:
      return "Barback's own email and password sign-in.";
  }
}
