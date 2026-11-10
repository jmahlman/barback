import "server-only";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { apiNinjasProvider } from "@/lib/providers/api-ninjas";
import { cocktailGlassProvider } from "@/lib/providers/cocktail-glass";
import { cocktailDbProvider } from "@/lib/providers/cocktaildb";
import {
  PROVIDER_IDS,
  isProviderId,
  type CocktailProvider,
  type ProviderId,
} from "@/lib/providers/types";

export { isProviderId };

export const PROVIDERS: Record<ProviderId, CocktailProvider> = {
  cocktailglass: cocktailGlassProvider,
  cocktaildb: cocktailDbProvider,
  apininjas: apiNinjasProvider,
};

/** In the order Settings shows them: the default first. */
export const PROVIDER_LIST: CocktailProvider[] = PROVIDER_IDS.map((id) => PROVIDERS[id]);

/** Used when nothing has been chosen, or what was chosen no longer exists. */
export const DEFAULT_PROVIDER: CocktailProvider = cocktailGlassProvider;

export function getProvider(id: ProviderId): CocktailProvider {
  return PROVIDERS[id];
}

/** The provider chosen on the Settings page. */
export async function preferredProvider(): Promise<CocktailProvider> {
  const stored = await getSetting(SETTING_KEYS.preferredProvider);
  return isProviderId(stored) ? PROVIDERS[stored] : DEFAULT_PROVIDER;
}

export async function fallbackEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.fallbackEnabled)) === "true";
}

/**
 * The providers to try, in order: the preferred one first, then the others if
 * fallback is switched on and they are configured.
 *
 * Fallback is off by default. The providers return noticeably different data,
 * and silently swapping to a weaker one would make results change for reasons
 * that are invisible from the UI.
 *
 * The preferred provider is in the chain even without a key, deliberately.
 * Leaving it out would quietly put another provider's name and drinks on
 * Discover, and hide its own cached drinks, which work offline with or
 * without a key. A scan skips it with a clear error instead, and Discover
 * says up front when it cannot be asked (see `lookupProvider`).
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

/**
 * The provider a lookup button would actually reach: the first one in the
 * chain that is configured. Null when none is, so the page can say why
 * instead of offering a button that can only fail.
 */
export async function lookupProvider(
  chain?: CocktailProvider[],
): Promise<CocktailProvider | null> {
  for (const provider of chain ?? (await providerChain())) {
    if (await provider.isConfigured()) return provider;
  }
  return null;
}
