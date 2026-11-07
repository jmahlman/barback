/**
 * Usernames, and telling them apart from email addresses.
 *
 * Barback accepts either at sign-in, and reverse proxies supply one or the
 * other depending on how they are configured, so both need to resolve to the
 * same account.
 */

/** Anything with an @ and something either side is treated as an email. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.?[^\s@]*$/.test(value.trim()) && value.includes("@");
}

/**
 * Canonical form of a username: lowercase, trimmed, and stripped of the
 * decoration directories tend to add. Stored exactly as this, so a proxy
 * sending "John" matches an account created as "john".
 */
export function normaliseUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    // Some proxies pass a UPN or a full DN; keep the leading handle.
    .replace(/@.*$/, "")
    .replace(/^.*\\/, "")
    .replace(/[^a-z0-9._-]/g, "");
}

export interface UsernameCheck {
  ok: boolean;
  value: string;
  error?: string;
}

const RESERVED = new Set([
  "admin", "administrator", "root", "system", "barback", "api", "setup",
  "settings", "signin", "sign-in", "signup", "sign-up", "me", "null",
  "undefined",
]);

export function validateUsername(raw: string): UsernameCheck {
  const value = normaliseUsername(raw);

  if (!value) {
    return { ok: false, value, error: "Pick a username." };
  }
  if (value.length < 2) {
    return { ok: false, value, error: "Usernames need at least 2 characters." };
  }
  if (value.length > 48) {
    return { ok: false, value, error: "Usernames can be at most 48 characters." };
  }
  if (!/^[a-z0-9]/.test(value)) {
    return { ok: false, value, error: "Usernames must start with a letter or number." };
  }
  if (RESERVED.has(value)) {
    return { ok: false, value, error: `"${value}" is reserved. Pick another.` };
  }

  return { ok: true, value };
}

/**
 * The address to store when someone has a username but no real email.
 *
 * Accounts still carry an email because it is the stable unique key the rest
 * of the schema is built on; this keeps that true without inventing an
 * address that looks deliverable.
 */
export function placeholderEmail(username: string, domain: string): string {
  return `${username}@${domain}`;
}

/** True for an address Barback generated rather than one a person gave. */
export function isPlaceholderEmail(email: string, domain: string): boolean {
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}
