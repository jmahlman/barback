"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearApiKey, saveProviderSettings } from "@/actions/settings";
import { clearCocktailCache, testProvider } from "@/actions/discover";
import { CheckIcon, SparkIcon, TrashIcon, XIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import type { ActionResult } from "@/actions/inventory";
import { PasswordField } from "@/components/password-field";

export interface ProviderView {
  id: string;
  label: string;
  description: string;
  capabilities: {
    images: boolean;
    stableIds: boolean;
    multiIngredientFilter: boolean;
    resultLimit: number | null;
    catalog: boolean;
  };
  /** Masked form of the stored key, empty when none. */
  maskedKey: string;
  configured: boolean;
  /** False for a provider that works without signing up for anything. */
  needsKey: boolean;
  source: "database" | "environment" | "default";
  cachedCount: number;
  signupUrl: string | null;
  keyField: string | null;
}

const SOURCE_LABEL: Record<ProviderView["source"], string> = {
  database: "set here",
  environment: "from the environment",
  default: "using the built-in default",
};

export function SettingsForm({
  providers,
  preferredProvider,
  fallbackEnabled,
  canEdit,
}: {
  providers: ProviderView[];
  preferredProvider: string;
  fallbackEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preferred, setPreferred] = useState(preferredProvider);
  const [fallback, setFallback] = useState(fallbackEnabled);
  const [tests, setTests] = useState<Record<string, ActionResult | null>>({});
  const [testing, setTesting] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="card p-5">
        <h2 className="font-display text-xl text-bar-200">Settings are locked</h2>
        <p className="mt-2 text-sm text-bar-400">
          Only the instance owner — the first account created here — can change
          API keys and provider settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        action={(formData) => {
          formData.set("preferredProvider", preferred);
          if (fallback) formData.set("fallbackEnabled", "on");
          else formData.delete("fallbackEnabled");

          startTransition(async () => {
            const res = await saveProviderSettings(formData);
            setResult(res);
            if (res.ok) router.refresh();
          });
        }}
        className="space-y-8"
      >
        {/* Which provider to use */}
        <section id="cocktail-data" className="scroll-mt-6 space-y-3">
          <div>
            <h2 className="font-display text-xl text-bar-200">Cocktail data</h2>
            <p className="mt-1 text-sm text-bar-400">
              Which service Barback asks when you press a lookup button.
              Nothing is requested while you browse.
            </p>
          </div>

          <div className="space-y-2">
            {providers.map((provider) => (
              <label
                key={provider.id}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                  preferred === provider.id
                    ? "border-brass-400 bg-brass-400/10"
                    : "border-bar-800 bg-bar-900 hover:bg-bar-850"
                }`}
              >
                <input
                  type="radio"
                  name="preferredProviderRadio"
                  value={provider.id}
                  checked={preferred === provider.id}
                  onChange={() => setPreferred(provider.id)}
                  className="mt-1 size-4 shrink-0 accent-brass-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-bar-200">{provider.label}</span>
                    {!provider.needsKey ? (
                      <span className="chip border-citrus-400/40 text-citrus-400">
                        <CheckIcon className="size-3" />
                        no key needed
                      </span>
                    ) : provider.configured ? (
                      <span className="chip border-citrus-400/40 text-citrus-400">
                        <CheckIcon className="size-3" />
                        key {SOURCE_LABEL[provider.source]}
                      </span>
                    ) : (
                      <span className="chip border-cherry-400/40 text-cherry-400">
                        <XIcon className="size-3" />
                        no key
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-bar-400">
                    {provider.description}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <Capability on={provider.capabilities.images}>photos</Capability>
                    <Capability on={provider.capabilities.stableIds}>
                      stable links
                    </Capability>
                    <Capability on={provider.capabilities.catalog}>
                      whole catalog
                    </Capability>
                    <Capability on={provider.capabilities.multiIngredientFilter}>
                      multi-ingredient search
                    </Capability>
                    {provider.capabilities.resultLimit ? (
                      <span className="chip">
                        max {provider.capabilities.resultLimit} per search
                      </span>
                    ) : null}
                  </span>
                  {/* Choosing it is allowed, and its saved cocktails still
                      show; but say now that lookups cannot work yet. */}
                  {preferred === provider.id && provider.needsKey && !provider.configured ? (
                    <span className="mt-2 block text-xs text-cherry-400">
                      Lookups can&rsquo;t reach {provider.label} until it has a key. Add one
                      under{" "}
                      <a
                        href="#provider-keys"
                        className="underline underline-offset-4"
                      >
                        Keys and connections
                      </a>
                      {fallback ? ", or Discover will use the other providers meanwhile." : "."}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm text-bar-300">
            <input
              type="checkbox"
              checked={fallback}
              onChange={(e) => setFallback(e.target.checked)}
              className="mt-0.5 size-4 accent-brass-400"
            />
            <span>
              Fall back to the others when your chosen provider fails
              <span className="mt-0.5 block text-xs text-bar-400">
                Off by default. The services return quite different data, so a
                silent switch can change your results for reasons the page does
                not show.
              </span>
            </span>
          </label>
        </section>

        {/* Keys */}
        <section id="provider-keys" className="scroll-mt-6 space-y-3">
          <div>
            <h2 className="font-display text-xl text-bar-200">Keys and connections</h2>
            <p className="mt-1 text-sm text-bar-400">
              Keys are stored in your own database. Saved values take precedence
              over environment variables, so you can change one without
              redeploying.
            </p>
          </div>

          {providers.map((provider) => (
            <div key={provider.id} className="card space-y-3 p-4">
              {provider.needsKey && provider.keyField ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <label className="label mb-0" htmlFor={provider.keyField}>
                      {provider.label} key
                    </label>
                    {provider.signupUrl ? (
                      <a
                        href={provider.signupUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-brass-300 underline-offset-4 hover:underline"
                      >
                        Get a key
                      </a>
                    ) : null}
                  </div>

                  <PasswordField
                    id={provider.keyField}
                    name={provider.keyField}
                    autoComplete="off"
                    reveals="key"
                    className="field font-mono"
                    placeholder={
                      provider.maskedKey
                        ? `Currently ${provider.maskedKey} — type to replace`
                        : "Paste your key"
                    }
                  />
                </>
              ) : (
                <div>
                  <p className="label mb-0">{provider.label}</p>
                  <p className="text-sm text-bar-400">
                    No key needed — nothing to configure.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={testing === provider.id || !provider.configured}
                  onClick={() => {
                    setTesting(provider.id);
                    startTransition(async () => {
                      const res = await testProvider(provider.id);
                      setTests((current) => ({ ...current, [provider.id]: res }));
                      setTesting(null);
                    });
                  }}
                  className="btn-secondary"
                >
                  <SparkIcon className="size-4" />
                  {testing === provider.id ? "Testing…" : "Test connection"}
                </button>

                {provider.needsKey && provider.source === "database" ? (
                  <ConfirmButton
                    label="Remove key"
                    confirmLabel="Remove it"
                    question={`Remove the stored ${provider.label} key?`}
                    detail="If the same key is set in your environment, that one takes over again."
                    icon={<TrashIcon className="size-4" />}
                    className="btn-ghost text-sm"
                    busyLabel="Removing…"
                    onConfirm={async () => {
                      await clearApiKey(provider.id);
                      router.refresh();
                    }}
                  />
                ) : null}

                {provider.cachedCount > 0 ? (
                  <ConfirmButton
                    label={`Clear ${provider.cachedCount} cached`}
                    confirmLabel="Clear them"
                    question={`Forget ${provider.cachedCount} cocktails cached from ${provider.label}?`}
                    detail="Your own recipes are untouched."
                    className="btn-ghost text-sm"
                    busyLabel="Clearing…"
                    onConfirm={async () => {
                      await clearCocktailCache(provider.id);
                      router.refresh();
                    }}
                  />
                ) : null}
              </div>

              {tests[provider.id] ? (
                <p
                  role="status"
                  className={`text-sm ${
                    tests[provider.id]?.ok ? "text-citrus-400" : "text-cherry-400"
                  }`}
                >
                  {tests[provider.id]?.error}
                </p>
              ) : null}
            </div>
          ))}
        </section>

        {result ? (
          <p
            role="status"
            className={`text-sm ${result.ok ? "text-citrus-400" : "text-cherry-400"}`}
          >
            {result.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}

function Capability({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`chip ${on ? "border-bar-700 text-bar-300" : "border-bar-800 text-bar-600 line-through"}`}
    >
      {children}
    </span>
  );
}
