import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SetupForm } from "@/components/setup-form";
import { AuthBackdrop } from "@/components/auth-backdrop";
import { GlassIcon, KeyIcon } from "@/components/icons";
import { getAuthMode, HAS_SESSION_SECRET } from "@/lib/auth-mode";
import { isSetupComplete } from "@/lib/setup";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Must be resolved per request: whether setup is still pending is a fact
 * about the database, and prerendering it would freeze the answer from
 * build time, when there is no database at all.
 */
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Once an account exists this page is closed for good.
  if (await isSetupComplete()) redirect("/");

  const mode = await getAuthMode();

  return (
    <AuthBackdrop>
      <div className="w-full space-y-6">
        <header className="on-photo text-center">
          <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl border border-bar-800 bg-bar-900/90 text-brass-400 shadow-lg shadow-black/40">
            <GlassIcon className="size-8" />
          </span>
          <h1 className="font-logo text-4xl text-brass-300 sm:text-5xl">Barback</h1>
          <p className="mt-2 text-sm text-bar-200">
            Your home bar, organised. Let&apos;s make your account.
          </p>
        </header>

        <section className="card space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-bar-300">
            <KeyIcon className="size-4 text-brass-400" />
            This is your administrator account
          </h2>
          <p className="text-xs text-bar-400">
            It owns the instance: it manages everyone else, the cocktail API
            keys, and how people sign in.
          </p>
          <p className="text-xs text-bar-400">
            It also keeps a password even if you later move to signing in
            through a reverse proxy. That is on purpose — it is how you get
            back in at this server&apos;s own address if the proxy is ever
            down or misconfigured. Pick a real password and store it
            somewhere safe.
          </p>
        </section>

        {!HAS_SESSION_SECRET ? (
          <p className="rounded-xl border border-cherry-400/40 bg-cherry-400/5 p-3 text-xs text-cherry-400">
            <strong>BETTER_AUTH_SECRET is not set.</strong> You can create the
            account, but you will be signed out whenever the server restarts.
            Set it and restart before you rely on this instance.
          </p>
        ) : null}

        {mode !== "local" ? (
          <p className="rounded-xl border border-brass-400/30 bg-brass-400/5 p-3 text-xs text-brass-300">
            This instance is configured for <strong>{mode}</strong> mode.
            Setting up the administrator first means you always have a way in
            that does not depend on it.
          </p>
        ) : null}

        <SetupForm authMode={mode} />
      </div>
    </AuthBackdrop>
  );
}
