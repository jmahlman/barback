import "server-only";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { apiNinjasProvider } from "@/lib/providers/api-ninjas";
import { cocktailDbProvider } from "@/lib/providers/cocktaildb";
import type { CocktailProvider, ProviderId } from "@/lib/providers/types";

export const PROVIDERS: Record<ProviderId, CocktailProvider> = {
  cocktaildb: cocktailDbProvider,
  apininjas: apiNinjasProvider,
};

export const PROVIDER_LIST: CocktailProvider[] = [
  cocktailDbProvider,
  apiNinjasProvider,
];

export function getProvider(id: ProviderId): CocktailProvider {
  return PROVIDERS[id];
}

export function isProviderId(value: string): value is ProviderId {
  return value === "cocktaildb" || value === "apininjas";
}

/** The provider chosen on the Settings page. */
export async function preferredProvider(): Promise<CocktailProvider> {
  const stored = await getSetting(SETTING_KEYS.preferredProvider);
  return isProviderId(stored) ? PROVIDERS[stored] : cocktailDbProvider;
}

export async function fallbackEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.fallbackEnabled)) === "true";
}

/**
 * The providers to try, in order: the preferred one first, then the other if
 * fallback is switched on and it has a key.
 *
 * Fallback is off by default. The providers return noticeably different data,
 * and silently swapping to a weaker one would make results change for reasons
 * that are invisible from the UI.
 */
export async function providerChain(): Promise<CocktailProvider[]> {
  const preferred = await preferredProvider();
  const chain = [preferred];

  if (await fallbackEnabled()) {
    for (const candidate of PROVIDER_LIST) {
      if (candidate.id === preferred.id) continue;
      if (await candidate.isConfigured()) chain.push(candidate);
    }
  }

  return chain;
}
