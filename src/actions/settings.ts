"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { isProviderId } from "@/lib/providers/registry";
import {
  AUTH_MODE_LOCKED,
  AUTH_MODE_SETTING,
  HAS_SESSION_SECRET,
  PROXY_HEADERS,
  getAuthMode,
  isAuthMode,
} from "@/lib/auth-mode";
import type { ActionResult } from "@/actions/inventory";

/** Settings hold API keys, so only the instance owner may change them. */
async function requireOwner() {
  const user = await requireUser();
  if (!(await isOwner(user.id))) {
    return null;
  }
  return user;
}

const schema = z.object({
  preferredProvider: z.string().refine(isProviderId, "Unknown provider."),
  fallbackEnabled: z.boolean(),
  cocktaildbApiKey: z.string().trim().max(200),
  apiNinjasApiKey: z.string().trim().max(200),
});

/**
 * Save the provider configuration.
 *
 * A key field left untouched arrives as the empty string and is ignored, so
 * editing the provider choice never wipes a stored key. Clearing a key is an
 * explicit action of its own.
 */
export async function saveProviderSettings(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change these settings." };
  }

  const parsed = schema.safeParse({
    preferredProvider: String(formData.get("preferredProvider") ?? "cocktailglass"),
    fallbackEnabled: formData.get("fallbackEnabled") === "on",
    cocktaildbApiKey: String(formData.get("cocktaildbApiKey") ?? ""),
    apiNinjasApiKey: String(formData.get("apiNinjasApiKey") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those settings are invalid." };
  }

  const data = parsed.data;

  await setSetting(SETTING_KEYS.preferredProvider, data.preferredProvider);
  await setSetting(SETTING_KEYS.fallbackEnabled, data.fallbackEnabled ? "true" : "false");

  if (data.cocktaildbApiKey) {
    await setSetting(SETTING_KEYS.cocktaildbApiKey, data.cocktaildbApiKey);
  }
  if (data.apiNinjasApiKey) {
    await setSetting(SETTING_KEYS.apiNinjasApiKey, data.apiNinjasApiKey);
  }

  revalidatePath("/settings");
  revalidatePath("/discover");
  return { ok: true, error: "Settings saved." };
}

/** Remove a stored key, revealing the environment value again if there is one. */
export async function clearApiKey(providerId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change these settings." };
  }
  if (!isProviderId(providerId)) return { ok: false, error: "Unknown provider." };

  // A ternary used to pick between the two keys, so any third provider would
  // have cleared API Ninjas' key by mistake.
  const keyFor: Record<typeof providerId, (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS] | null> = {
    cocktailglass: null,
    cocktaildb: SETTING_KEYS.cocktaildbApiKey,
    apininjas: SETTING_KEYS.apiNinjasApiKey,
  };
  const settingKey = keyFor[providerId];
  if (!settingKey) return { ok: false, error: "That provider has no key to remove." };

  await setSetting(settingKey, "");

  revalidatePath("/settings");
  revalidatePath("/discover");
  return { ok: true, error: "Key removed." };
}


// --- Authentication mode ---------------------------------------------------

/**
 * Change how people sign in.
 *
 * This is the one setting that can lock the owner out of their own instance,
 * so it refuses the changes that would obviously do so, and the UI makes the
 * rest explicit before it is applied. It takes effect on the next request;
 * nothing restarts.
 */
export async function setAuthMode(next: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change this." };
  }

  if (!isAuthMode(next)) {
    return { ok: false, error: "Unknown authentication mode." };
  }

  if (AUTH_MODE_LOCKED) {
    return {
      ok: false,
      error:
        "AUTH_MODE is set in the environment, which overrides this setting. Remove it to manage the mode here.",
    };
  }

  const current = await getAuthMode();
  if (current === next) return { ok: true, error: "Already using that mode." };

  // Local mode signs its own sessions. Without a secret every restart would
  // invalidate them, and nobody could stay signed in.
  if (next === "local" && !HAS_SESSION_SECRET) {
    return {
      ok: false,
      error:
        "Set BETTER_AUTH_SECRET first, otherwise sign-ins will not survive a restart. Generate one with: openssl rand -base64 32",
    };
  }

  // Switching to proxy mode when nothing is in front of Barback leaves no way
  // in at all, since password sign-in is switched off at the same moment.
  if (next === "proxy") {
    const headers = await import("next/headers").then((m) => m.headers());
    const sawProxyIdentity =
      headers.has(PROXY_HEADERS.user) || headers.has(PROXY_HEADERS.email);
    if (!sawProxyIdentity) {
      return {
        ok: false,
        error:
          `This request arrived without the ${PROXY_HEADERS.user} header, so a reverse proxy is not in front of Barback yet. ` +
          "Switching now would lock everyone out. Put the proxy in place first, then switch.",
      };
    }
  }

  await setSetting(AUTH_MODE_SETTING as never, next);

  revalidatePath("/settings");
  revalidatePath("/admin");
  revalidatePath("/");

  const note: Record<string, string> = {
    local: "Password sign-in is on. Existing sessions still work.",
    proxy:
      "Identity now comes from your reverse proxy. Password sign-in is switched off.",
    none: "Authentication is off. Everyone who can reach this instance is the owner account.",
  };
  return { ok: true, error: `Switched to ${next} mode. ${note[next]}` };
}

/** Open or close self-registration. Applies on the next request. */
export async function setSignupsAllowed(allowed: boolean): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change this." };
  }

  await setSetting(SETTING_KEYS.allowSignups, allowed ? "true" : "false");

  revalidatePath("/settings");
  revalidatePath("/admin");
  revalidatePath("/sign-in");
  revalidatePath("/sign-up");

  return {
    ok: true,
    error: allowed
      ? "Anyone who can reach this instance can now create an account."
      : "Account creation is closed. Add people from the People page instead.",
  };
}


// --- Barcode lookup --------------------------------------------------------

/**
 * Save the barcode lookup configuration.
 *
 * As with the provider keys, a key field left untouched arrives empty and is
 * ignored, so toggling the switch never wipes a stored key.
 */
export async function saveBarcodeSettings(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change these settings." };
  }

  const parsed = z
    .object({
      lookupEnabled: z.boolean(),
      upcitemdbApiKey: z.string().trim().max(200),
    })
    .safeParse({
      lookupEnabled: formData.get("barcodeLookupEnabled") === "on",
      upcitemdbApiKey: String(formData.get("upcitemdbApiKey") ?? ""),
    });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those settings are invalid." };
  }

  await setSetting(
    SETTING_KEYS.barcodeLookupEnabled,
    parsed.data.lookupEnabled ? "true" : "false",
  );
  if (parsed.data.upcitemdbApiKey) {
    await setSetting(SETTING_KEYS.upcitemdbApiKey, parsed.data.upcitemdbApiKey);
  }

  revalidatePath("/settings");
  revalidatePath("/inventory");
  return { ok: true, error: "Settings saved." };
}

/** Remove the stored UPCitemdb key, falling back to the keyless trial tier. */
export async function clearUpcitemdbKey(): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) {
    return { ok: false, error: "Only the instance owner can change these settings." };
  }

  await setSetting(SETTING_KEYS.upcitemdbApiKey, "");

  revalidatePath("/settings");
  revalidatePath("/inventory");
  return { ok: true, error: "Key removed. Barcode lookups will use the free tier." };
}
