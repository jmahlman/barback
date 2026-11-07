/**
 * Cocktail data providers.
 *
 * Barback can read recipes from more than one upstream service. They differ a
 * lot — some have stable ids and photos, some return free text — so everything
 * is normalised to `ProviderDrink` before it reaches the rest of the app.
 *
 * Providers are only ever called from a server action, never while rendering.
 */

export interface ProviderIngredient {
  /** Display name, e.g. "Blanco tequila". */
  name: string;
  /** Normalised match key, e.g. "tequila". */
  slug: string;
  /** Measure exactly as published, e.g. "2 oz". Never invented. */
  measure: string | null;
}

export interface ProviderDrink {
  /** Which provider this came from. */
  provider: ProviderId;
  /** The provider's own identifier. */
  externalId: string;
  /** Namespaced key used for caching and URLs: "<provider>~<externalId>". */
  key: string;
  name: string;
  slug: string;
  thumbUrl: string | null;
  category: string | null;
  alcoholic: string | null;
  glass: string | null;
  instructions: string | null;
  ingredients: ProviderIngredient[];
  /** Canonical page upstream, when the provider has one. */
  sourceUrl: string | null;
}

export type ProviderId = "cocktaildb" | "apininjas";

export interface ProviderCapabilities {
  /** Supplies photographs. */
  images: boolean;
  /** Has stable ids, so a cached drink can be refetched later. */
  stableIds: boolean;
  /** Can filter on several ingredients at once. */
  multiIngredientFilter: boolean;
  /** Maximum results a single query can return, if capped. */
  resultLimit: number | null;
}

export interface CocktailProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Shown on the Settings page. */
  readonly description: string;
  readonly attribution: string;
  readonly capabilities: ProviderCapabilities;

  /** False when no API key is configured. */
  isConfigured(): Promise<boolean>;

  /** Drinks whose name matches. Returns full detail. */
  searchByName(query: string): Promise<ProviderDrink[]>;

  /** Drinks containing an ingredient. Returns full detail. */
  findByIngredient(slug: string): Promise<ProviderDrink[]>;

  /**
   * Refetch one drink by its own id. Providers without stable ids return null
   * and rely on the cache instead.
   */
  lookupById(externalId: string): Promise<ProviderDrink | null>;
}

/** Build the namespaced cache/URL key for a drink. */
export function drinkKey(provider: ProviderId, externalId: string): string {
  return `${provider}~${externalId}`;
}

/** Split a namespaced key back into its parts. */
export function parseDrinkKey(
  key: string,
): { provider: ProviderId; externalId: string } | null {
  const index = key.indexOf("~");
  if (index <= 0) return null;
  const provider = key.slice(0, index);
  const externalId = key.slice(index + 1);
  if (!externalId) return null;
  if (provider !== "cocktaildb" && provider !== "apininjas") return null;
  return { provider, externalId };
}

/** Raised when a provider cannot be reached or refuses the request. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
