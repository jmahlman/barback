import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Instance settings.
 *
 * Values saved on the Settings page win over environment variables, so an API
 * key can be added without editing docker-compose.yml and redeploying. The
 * environment stays useful for provisioning a new instance.
 */

export const SETTING_KEYS = {
  cocktaildbApiKey: "cocktaildb.apiKey",
  apiNinjasApiKey: "apininjas.apiKey",
  preferredProvider: "provider.preferred",
  fallbackEnabled: "provider.fallbackEnabled",
  allowSignups: "auth.allowSignups",
  updateCheck: "updates.checkAutomatically",
  releaseCache: "updates.releaseCache",
  releaseCheckedAt: "updates.checkedAt",
  dismissedVersion: "updates.dismissedVersion",
  barcodeLookupEnabled: "barcode.lookupEnabled",
  upcitemdbApiKey: "upcitemdb.apiKey",
  upcitemdbQuota: "upcitemdb.quota",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Environment fallback for each setting. */
const ENV_FALLBACK: Record<SettingKey, () => string | undefined> = {
  [SETTING_KEYS.cocktaildbApiKey]: () => process.env.COCKTAILDB_API_KEY,
  [SETTING_KEYS.apiNinjasApiKey]: () => process.env.API_NINJAS_API_KEY,
  [SETTING_KEYS.preferredProvider]: () => process.env.COCKTAIL_PROVIDER,
  [SETTING_KEYS.fallbackEnabled]: () => process.env.COCKTAIL_PROVIDER_FALLBACK,
  [SETTING_KEYS.allowSignups]: () => process.env.ALLOW_SIGNUPS,
  [SETTING_KEYS.updateCheck]: () => process.env.UPDATE_CHECK,
  [SETTING_KEYS.releaseCache]: () => undefined,
  [SETTING_KEYS.releaseCheckedAt]: () => undefined,
  [SETTING_KEYS.dismissedVersion]: () => undefined,
  [SETTING_KEYS.barcodeLookupEnabled]: () => process.env.BARCODE_LOOKUP,
  [SETTING_KEYS.upcitemdbApiKey]: () => process.env.UPCITEMDB_API_KEY,
  [SETTING_KEYS.upcitemdbQuota]: () => undefined,
};

const DEFAULTS: Record<SettingKey, string> = {
  // "1" is TheCocktailDB's free development key.
  [SETTING_KEYS.cocktaildbApiKey]: "1",
  [SETTING_KEYS.apiNinjasApiKey]: "",
  [SETTING_KEYS.preferredProvider]: "cocktaildb",
  [SETTING_KEYS.fallbackEnabled]: "false",
  // Open by default so a fresh instance is usable, and closable the moment
  // the owner has their account.
  [SETTING_KEYS.allowSignups]: "true",
  // Checking GitHub for a newer release is the one outbound request Barback
  // makes without being asked, and it is off unless you turn it on.
  [SETTING_KEYS.updateCheck]: "false",
  [SETTING_KEYS.releaseCache]: "",
  [SETTING_KEYS.releaseCheckedAt]: "",
  [SETTING_KEYS.dismissedVersion]: "",
  // On, unlike the update check, because it only ever fires when someone
  // presses Scan, and it sends a barcode and nothing else -- no key, no
  // account, no inventory. Turning it off still leaves the scanner working:
  // it fills the barcode in and you type the name yourself.
  [SETTING_KEYS.barcodeLookupEnabled]: "true",
  // Blank means UPCitemdb's keyless trial tier: 100 lookups a day, shared by
  // everything behind your IP address. A key raises that ceiling.
  [SETTING_KEYS.upcitemdbApiKey]: "",
  [SETTING_KEYS.upcitemdbQuota]: "",
};

async function readStored(): Promise<Map<string, string>> {
  const rows = await db.appSetting.findMany();
  return new Map(rows.map((row) => [row.key, row.value]));
}

/** All stored settings, deduplicated per request. */
const loadStored = cache(readStored);

function resolve(stored: Map<string, string>, key: SettingKey): string {
  const fromDb = stored.get(key)?.trim();
  if (fromDb) return fromDb;
  const fromEnv = ENV_FALLBACK[key]()?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULTS[key];
}

/**
 * Resolve several settings without React's per-request cache.
 *
 * The auth instance is built from these, and it is constructed in places that
 * are not always inside a React request scope, so it reads straight from the
 * database rather than relying on `cache()`.
 */
export async function getSettingsUncached<K extends SettingKey>(
  keys: readonly K[],
): Promise<Record<K, string>> {
  const stored = await readStored();
  const out = {} as Record<K, string>;
  for (const key of keys) out[key] = resolve(stored, key);
  return out;
}

/**
 * Resolve one setting: database value, then environment, then default.
 * Blank values fall through, so clearing a field in the UI reveals the
 * environment value again rather than leaving an empty key.
 */
export async function getSetting(key: SettingKey): Promise<string> {
  return resolve(await loadStored(), key);
}

/** Where a setting's current value came from — shown on the Settings page. */
export type SettingSource = "database" | "environment" | "default";

export async function getSettingSource(key: SettingKey): Promise<SettingSource> {
  const stored = (await loadStored()).get(key)?.trim();
  if (stored) return "database";
  if (ENV_FALLBACK[key]()?.trim()) return "environment";
  return "default";
}

/** Write a setting. An empty value removes the override. */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await db.appSetting.deleteMany({ where: { key } });
    return;
  }
  await db.appSetting.upsert({
    where: { key },
    create: { key, value: trimmed },
    update: { value: trimmed },
  });
}

/** Never show a stored key in full; just enough to recognise it. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}
