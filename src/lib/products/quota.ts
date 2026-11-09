import "server-only";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";
import type { QuotaState } from "@/lib/products/types";

/**
 * How much of UPCitemdb's free allowance is left.
 *
 * The free tier allows 100 lookups a day and counts them **per IP address**,
 * which means the allowance is shared with every other device behind the same
 * connection — and, if the container egresses through a VPN, with everyone
 * else on that exit node. The UI says so rather than leaving it a mystery.
 *
 * The authoritative numbers arrive on every response as rate-limit headers,
 * so they are recorded rather than counted. The local `spent` tally is a
 * fallback for when a proxy strips the headers or an error page replaces
 * them.
 */

const FREE_TIER_LIMIT = 100;

const EMPTY: QuotaState = {
  limit: FREE_TIER_LIMIT,
  remaining: FREE_TIER_LIMIT,
  resetAt: null,
  updatedAt: null,
  spent: 0,
};

function parse(raw: string): QuotaState {
  try {
    const value = JSON.parse(raw) as Partial<QuotaState>;
    return {
      limit: typeof value.limit === "number" ? value.limit : FREE_TIER_LIMIT,
      remaining: typeof value.remaining === "number" ? value.remaining : FREE_TIER_LIMIT,
      resetAt: typeof value.resetAt === "string" ? value.resetAt : null,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      spent: typeof value.spent === "number" ? value.spent : 0,
    };
  } catch {
    return EMPTY;
  }
}

/** Has the allowance rolled over since we last heard anything? */
function isStale(state: QuotaState): boolean {
  if (!state.resetAt) return false;
  return new Date(state.resetAt).getTime() <= Date.now();
}

export async function readQuota(): Promise<QuotaState> {
  const raw = await getSetting(SETTING_KEYS.upcitemdbQuota);
  if (!raw) return EMPTY;
  const state = parse(raw);
  // Past the reset time the stored numbers describe yesterday.
  if (isStale(state)) {
    return { ...EMPTY, limit: state.limit, updatedAt: state.updatedAt };
  }
  return state;
}

/**
 * The number to act on: the lower of what the service last told us and what
 * we have counted ourselves.
 */
export async function remainingLookups(): Promise<number> {
  const state = await readQuota();
  const counted = state.limit - state.spent;
  return Math.max(0, Math.min(state.remaining, counted));
}

export async function canSpend(): Promise<boolean> {
  return (await remainingLookups()) > 0;
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Record what a response said about the allowance, and count the request we
 * just made.
 *
 * `X-RateLimit-Reset` is epoch seconds. When it is missing, the allowance is
 * assumed to roll over at the next UTC midnight, which is close enough to
 * avoid refusing lookups for a whole day on bad information.
 */
export async function recordQuota(headers: Headers): Promise<void> {
  const previous = await readQuota();

  const limit = headerNumber(headers, "X-RateLimit-Limit") ?? previous.limit;
  const headerRemaining = headerNumber(headers, "X-RateLimit-Remaining");
  const resetSeconds = headerNumber(headers, "X-RateLimit-Reset");

  const spent = previous.spent + 1;
  const resetAt = resetSeconds
    ? new Date(resetSeconds * 1000).toISOString()
    : (previous.resetAt ?? nextUtcMidnight());

  const next: QuotaState = {
    limit,
    remaining: headerRemaining ?? Math.max(0, limit - spent),
    resetAt,
    updatedAt: new Date().toISOString(),
    spent,
  };

  await setSetting(SETTING_KEYS.upcitemdbQuota, JSON.stringify(next));
}

/** The service is refusing us; treat the allowance as gone until it resets. */
export async function recordExhausted(headers?: Headers): Promise<void> {
  const previous = await readQuota();
  const resetSeconds = headers ? headerNumber(headers, "X-RateLimit-Reset") : null;
  const next: QuotaState = {
    ...previous,
    remaining: 0,
    spent: previous.limit,
    resetAt: resetSeconds
      ? new Date(resetSeconds * 1000).toISOString()
      : (previous.resetAt ?? nextUtcMidnight()),
    updatedAt: new Date().toISOString(),
  };
  await setSetting(SETTING_KEYS.upcitemdbQuota, JSON.stringify(next));
}

function nextUtcMidnight(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}
