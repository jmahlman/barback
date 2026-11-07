"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { scanForCocktails, searchUpstreamByName } from "@/lib/discover";
import { clearCache } from "@/lib/providers/cache";
import { getProvider, isProviderId, providerChain } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import type { ActionResult } from "@/actions/inventory";

/**
 * Every function here reaches a cocktail provider over the network, so each
 * one is only reachable from an explicit button press. Page rendering reads
 * the local cache and never calls out on its own.
 */

export interface ScanResult extends ActionResult {
  found?: number;
  makeable?: number;
  providers?: string[];
}

/** Query the configured provider(s) for the whole shelf. */
export async function scanShelf(): Promise<ScanResult> {
  const user = await requireUser();
  const result = await scanForCocktails(user.id);

  if (result.emptyInventory) {
    return { ok: false, error: "Add something to your inventory first." };
  }

  // Only a failure when nothing came back at all. A provider that stumbled
  // while another succeeded is worth saying, not worth throwing results away.
  if (result.considered === 0) {
    return { ok: false, error: result.error ?? "No cocktails came back." };
  }

  revalidatePath("/discover");
  return {
    ok: true,
    found: result.considered,
    makeable: result.makeable.length,
    providers: result.providersUsed,
    error: result.error ?? undefined,
  };
}

/** Search upstream by name, cache the hits, then land on the cached results. */
export async function searchUpstream(formData: FormData): Promise<void> {
  await requireUser();
  const query = String(formData.get("q") ?? "").trim();
  if (!query) redirect("/discover");

  await searchUpstreamByName(query);

  revalidatePath("/discover");
  redirect(`/discover?q=${encodeURIComponent(query)}`);
}

/** Fetch one drink on demand. Only works for providers with stable ids. */
export async function fetchDrinkNow(key: string): Promise<ActionResult> {
  await requireUser();

  const separator = key.indexOf("~");
  if (separator <= 0) return { ok: false, error: "That drink reference is malformed." };

  const providerId = key.slice(0, separator);
  const externalId = key.slice(separator + 1);
  if (!isProviderId(providerId)) {
    return { ok: false, error: "Unknown provider for that drink." };
  }

  const provider = getProvider(providerId);
  if (!provider.capabilities.stableIds) {
    return {
      ok: false,
      error: `${provider.label} cannot look up a single drink by id. Search for it by name instead.`,
    };
  }
  if (!(await provider.isConfigured())) {
    return { ok: false, error: `No API key configured for ${provider.label}.` };
  }

  try {
    const drink = await provider.lookupById(externalId);
    if (!drink) {
      return { ok: false, error: `${provider.label} has no drink with that id.` };
    }
    const { cacheDrinks } = await import("@/lib/providers/cache");
    await cacheDrinks([drink]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ProviderError ? error.message : "The lookup failed.",
    };
  }

  revalidatePath(`/discover/${key}`);
  revalidatePath("/discover");
  return { ok: true };
}

/** Clear cached upstream data, optionally for one provider. */
export async function clearCocktailCache(providerId?: string): Promise<ActionResult> {
  await requireUser();
  const scoped = providerId && isProviderId(providerId) ? providerId : undefined;
  const removed = await clearCache(scoped);
  revalidatePath("/discover");
  revalidatePath("/settings");
  return { ok: true, error: `Cleared ${removed} cached cocktails.` };
}

/** Check a provider answers with the configured key. Explicit, from Settings. */
export async function testProvider(providerId: string): Promise<ActionResult> {
  await requireUser();
  if (!isProviderId(providerId)) return { ok: false, error: "Unknown provider." };

  const provider = getProvider(providerId);
  if (!(await provider.isConfigured())) {
    return { ok: false, error: "No API key is configured for this provider." };
  }

  try {
    // A well-known drink every source has.
    const drinks = await provider.searchByName("margarita");
    if (drinks.length === 0) {
      return { ok: false, error: `${provider.label} answered, but returned nothing.` };
    }
    return {
      ok: true,
      error: `${provider.label} is working — ${drinks.length} result${drinks.length === 1 ? "" : "s"} for “margarita”.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ProviderError ? error.message : "The request failed.",
    };
  }
}

/** Which providers are configured, for the Discover page's messaging. */
export async function activeProviderLabels(): Promise<string[]> {
  const chain = await providerChain();
  const out: string[] = [];
  for (const provider of chain) {
    if (await provider.isConfigured()) out.push(provider.label);
  }
  return out;
}
