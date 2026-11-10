import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { SettingsForm, type ProviderView } from "@/components/settings-form";
import { BarcodeSettings, type BarcodeSettingsView } from "@/components/barcode-settings";
import { MatchingSettings, type MatchingSettingsView } from "@/components/matching-settings";
import { SUBSTITUTION_GROUPS } from "@/lib/ingredients";
import { loadMatchingRules } from "@/lib/matching-rules";
import { SignOutButton } from "@/components/sign-out-button";
import { ChevronRightIcon } from "@/components/icons";
import { isOwner } from "@/lib/owner";
import { PROVIDER_LIST } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import { cachedCountsByProvider } from "@/lib/providers/cache";
import { cachedProductCounts } from "@/lib/products/cache";
import { readQuota, remainingLookups } from "@/lib/products/quota";
import {
  getSetting,
  getSettingSource,
  maskSecret,
  SETTING_KEYS,
} from "@/lib/settings";
import { signupsAllowed } from "@/lib/auth";
import { hasPasswordSession, requireUser } from "@/lib/session";
import {
  getReleaseState,
  maybeAutoCheck,
  pendingUpdateTag,
} from "@/lib/releases";
import {
  AUTH_MODES,
  AUTH_MODE_ENV,
  AUTH_MODE_LOCKED,
  HAS_SESSION_SECRET,
  getAuthMode,
} from "@/lib/auth-mode";
import {
  AuthModeSettings,
  type AuthModeOption,
} from "@/components/auth-mode-settings";

export const metadata: Metadata = { title: "Settings" };

type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Where each provider's key lives, if it has one.
 *
 * Keyed by ProviderId rather than by string, so that adding a provider and
 * forgetting it here fails the typecheck. It used to be a plain string map,
 * which compiled happily and then crashed this page at runtime.
 */
const PROVIDER_META: Record<
  ProviderId,
  { signupUrl: string; keyField: string; settingKey: SettingKey } | null
> = {
  // No key and no sign-up.
  cocktailglass: null,
  cocktaildb: {
    signupUrl: "https://www.thecocktaildb.com/api.php",
    keyField: "cocktaildbApiKey",
    settingKey: SETTING_KEYS.cocktaildbApiKey,
  },
  apininjas: {
    signupUrl: "https://api-ninjas.com/api/cocktail",
    keyField: "apiNinjasApiKey",
    settingKey: SETTING_KEYS.apiNinjasApiKey,
  },
};

/** What each mode does, and what choosing it will change. */
function buildModeOptions(current: string): AuthModeOption[] {
  return AUTH_MODES.map((value): AuthModeOption => {
    if (value === "local") {
      return {
        value,
        label: "Local — email and password",
        summary: "Barback manages its own accounts and passwords.",
        consequences: [
          "Turn the sign-in page and password endpoints back on.",
          "Let the owner add people and set passwords from the People page.",
          current === "none"
            ? "Require a sign-in where previously there was none."
            : "Stop reading identity headers from your proxy.",
        ],
        blockedReason: HAS_SESSION_SECRET
          ? undefined
          : "BETTER_AUTH_SECRET is not set. Without it, sign-ins would not survive a restart.",
      };
    }

    if (value === "proxy") {
      return {
        value,
        label: "Proxy — identity from a reverse proxy",
        summary:
          "Authelia, Authentik, Traefik forward-auth and similar. Barback reads the identity from request headers.",
        consequences: [
          "Switch off password sign-in entirely; those endpoints return 404.",
          "Create an account the first time it sees each person.",
          "Lock everyone out if a proxy is not actually in front of Barback.",
        ],
      };
    }

    return {
      value,
      label: "None — no authentication",
      summary:
        "Everyone who can reach this instance is the same user. Private networks only.",
      consequences: [
        "Let anyone who can reach this instance straight in, with no sign-in.",
        "Treat every visitor as the owner account, so your existing bar and recipes stay visible.",
        "Hide the People page, since there is only one account.",
      ],
    };
  });
}

export default async function SettingsPage() {
  const user = await requireUser();
  const owner = await isOwner(user.id);
  const mode = await getAuthMode();
  const signupsOpen = await signupsAllowed();
  const canSignOut = await hasPasswordSession();

  // Does nothing unless the owner switched automatic checking on, and then
  // at most once a day.
  if (owner) await maybeAutoCheck();
  const releaseState = await getReleaseState();
  const badgeTag = await pendingUpdateTag();

  // Shown to everyone: it decides what every recipe page says. Nothing
  // secret in it, unlike the provider settings below.
  const rules = await loadMatchingRules();
  const matching: MatchingSettingsView = {
    groups: SUBSTITUTION_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      on: rules.substitutions.has(group.id),
    })),
    garnishesOptional: rules.garnishesOptional,
    assumeStaples: rules.assumeStaples,
  };

  // A non-owner is sent no provider configuration at all. Rendering the
  // locked view is not enough on its own: anything passed as a prop ends up
  // in the payload the browser receives, masked key included.
  if (!owner) {
    return (
      <AppShell user={user}>
        <PageHeader title="Settings" subtitle="How Barback matches your shelf and looks cocktails up." />
        <PageBody>
          <MatchingSettings initial={matching} canEdit={false} />
          <div className="border-t border-bar-800 pt-6">
            <SettingsForm
              providers={[]}
              preferredProvider=""
              fallbackEnabled={false}
              canEdit={false}
            />
          </div>
          <section className="space-y-2 border-t border-bar-800 pt-6">
            <h2 className="font-display text-xl text-bar-200">Account</h2>
            <p className="text-sm text-bar-400">{user.email}</p>
            {canSignOut ? <SignOutButton /> : null}
          </section>
        </PageBody>
      </AppShell>
    );
  }

  const [preferred, fallback, counts] = await Promise.all([
    getSetting(SETTING_KEYS.preferredProvider),
    getSetting(SETTING_KEYS.fallbackEnabled),
    cachedCountsByProvider(),
  ]);

  const [
    barcodeEnabled,
    upcitemdbKey,
    upcitemdbSource,
    productCounts,
    quota,
    remaining,
  ] = await Promise.all([
    getSetting(SETTING_KEYS.barcodeLookupEnabled),
    getSetting(SETTING_KEYS.upcitemdbApiKey),
    getSettingSource(SETTING_KEYS.upcitemdbApiKey),
    cachedProductCounts(),
    readQuota(),
    remainingLookups(),
  ]);

  const barcode: BarcodeSettingsView = {
    lookupEnabled: barcodeEnabled === "true",
    // Only ever a masked form reaches the browser.
    maskedKey: maskSecret(upcitemdbKey),
    configured: Boolean(upcitemdbKey),
    source: upcitemdbSource,
    quota: { remaining, limit: quota.limit, resetAt: quota.resetAt },
    cache: productCounts,
  };

  const authModeOptions = buildModeOptions(mode);

  const providers: ProviderView[] = await Promise.all(
    PROVIDER_LIST.map(async (provider) => {
      const meta = PROVIDER_META[provider.id];
      const key = meta ? await getSetting(meta.settingKey) : "";
      const source = meta ? await getSettingSource(meta.settingKey) : "default";
      return {
        id: provider.id,
        label: provider.label,
        description: provider.description,
        capabilities: provider.capabilities,
        // Only ever a masked form reaches the browser.
        maskedKey: maskSecret(key),
        configured: await provider.isConfigured(),
        needsKey: meta !== null,
        source,
        cachedCount: counts[provider.id] ?? 0,
        signupUrl: meta?.signupUrl ?? null,
        keyField: meta?.keyField ?? null,
      };
    }),
  );

  return (
    <AppShell user={user}>
      <PageHeader title="Settings" subtitle="How Barback matches your shelf and looks cocktails up." />
      <PageBody>
        <MatchingSettings initial={matching} canEdit />

        <div className="border-t border-bar-800 pt-6">
          <SettingsForm
            providers={providers}
            preferredProvider={preferred}
            fallbackEnabled={fallback === "true"}
            canEdit={owner}
          />
        </div>

        <div className="border-t border-bar-800 pt-6">
          <BarcodeSettings initial={barcode} />
        </div>

        <div className="border-t border-bar-800 pt-6">
          <AuthModeSettings
            current={mode}
            options={authModeOptions}
            locked={AUTH_MODE_LOCKED}
            lockedBy={AUTH_MODE_ENV}
            signupsOpen={signupsOpen}
          />
        </div>

        <section className="space-y-2 border-t border-bar-800 pt-6">
          <h2 className="font-display text-xl text-bar-200">About</h2>
          <Link
            href="/settings/releases"
            className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-bar-700 hover:bg-bar-850"
          >
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-bar-200">Releases and changelog</span>
                {badgeTag ? (
                  <span className="chip border-brass-400/40 text-brass-300">
                    {badgeTag} available
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-bar-400">
                Running {releaseState.current}. What changed in each version,
                and whether there is a newer one.
              </span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-bar-400" />
          </Link>

          <Link
            href="/settings/data-sources"
            className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-bar-700 hover:bg-bar-850"
          >
            <span>
              <span className="block text-sm text-bar-200">Outside services</span>
              <span className="block text-xs text-bar-400">
                Barcode and cocktail lookups, and the update check. What each
                one is told, and under whose terms.
              </span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-bar-400" />
          </Link>

          <Link
            href="/settings/licenses"
            className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-bar-700 hover:bg-bar-850"
          >
            <span>
              <span className="block text-sm text-bar-200">Open source licenses</span>
              <span className="block text-xs text-bar-400">
                Every package this build is made from, with versions and
                license texts.
              </span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-bar-400" />
          </Link>
        </section>

        <section className="space-y-2 border-t border-bar-800 pt-6">
          <h2 className="font-display text-xl text-bar-200">Account</h2>
          <p className="text-sm text-bar-400">{user.email} · instance owner</p>
          {canSignOut ? <SignOutButton /> : null}
        </section>
      </PageBody>
    </AppShell>
  );
}
