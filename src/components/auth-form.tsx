"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { signInWithIdentifier } from "@/actions/sign-in";
import { PasswordField } from "@/components/password-field";
import { KeyIcon } from "@/components/icons";

export function AuthForm({
  mode,
  signupsAllowed,
  passkeyDomain = null,
}: {
  mode: "sign-in" | "sign-up";
  signupsAllowed: boolean;
  /** Where passkeys work; null when this instance does not offer them. */
  passkeyDomain?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "sign-up";

  // Passkeys need a secure context: HTTPS, or localhost. Over plain HTTP the
  // browser has no WebAuthn at all, so the button is simply not offered.
  const [passkeys, setPasskeys] = useState(false);

  const finishPasskey = useCallback(
    (result: Awaited<ReturnType<typeof signIn.passkey>>, quiet: boolean) => {
      if (!result?.error) {
        router.replace("/");
        router.refresh();
        return;
      }
      const { message } = result.error;
      const code = "code" in result.error ? result.error.code : undefined;
      // Closing the browser's prompt is not an error worth showing, and the
      // autofill request is cancelled whenever the button is used instead.
      if (quiet || code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED") return;
      setError(
        code === "BANNED_USER"
          ? (message ?? "That account is suspended.")
          : "That passkey did not work. Try again, or use your password.",
      );
    },
    [router],
  );

  useEffect(() => {
    if (isSignUp || !passkeyDomain) return;
    if (!window.isSecureContext || typeof window.PublicKeyCredential === "undefined") return;
    // A passkey only works on the domain it was made for; anywhere else the
    // button could only fail.
    if (window.location.hostname !== passkeyDomain) return;
    setPasskeys(true);

    // Offer saved passkeys in the username field's autofill, where the
    // browser supports it, so signing in can be one tap.
    let cancelled = false;
    PublicKeyCredential.isConditionalMediationAvailable?.()
      .then(async (available) => {
        if (!available || cancelled) return;
        const result = await signIn.passkey({ autoFill: true });
        if (!cancelled) finishPasskey(result, Boolean(result?.error));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignUp, passkeyDomain, finishPasskey]);

  async function signInWithPasskey() {
    setError(null);
    setBusy(true);
    const result = await signIn.passkey();
    finishPasskey(result, false);
    setBusy(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    if (isSignUp) {
      const result = await signUp.email({
        email: identifier,
        password,
        name: name || identifier.split("@")[0],
      });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
    } else {
      // Runs on the server so a username cannot be probed from the browser.
      const result = await signInWithIdentifier(identifier, password);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="on-photo text-center">
        <p className="font-logo text-4xl text-brass-300 sm:text-5xl">Barback</p>
        <p className="mt-2 text-sm text-bar-200">
          {isSignUp
            ? "Set up your home bar."
            : "Welcome back. What are we making tonight?"}
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4 p-5 shadow-xl shadow-black/40">
        {isSignUp ? (
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="field"
              placeholder="Your name"
            />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="identifier">
            {isSignUp ? "Email" : "Username or email"}
          </label>
          <input
            id="identifier"
            name="identifier"
            type={isSignUp ? "email" : "text"}
            required
            // "webauthn" lets the browser list passkeys in this field's
            // autofill alongside saved usernames.
            autoComplete={passkeys ? "username webauthn" : "username"}
            autoCapitalize="none"
            inputMode={isSignUp ? "email" : "text"}
            className="field"
            placeholder={isSignUp ? "you@example.com" : "john"}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <PasswordField
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-cherry-400">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
        </button>

        {passkeys ? (
          <>
            <div className="flex items-center gap-3 text-xs text-bar-500" aria-hidden>
              <span className="h-px flex-1 bg-bar-800" />
              or
              <span className="h-px flex-1 bg-bar-800" />
            </div>
            <button
              type="button"
              onClick={signInWithPasskey}
              disabled={busy}
              className="btn-secondary w-full"
            >
              <KeyIcon className="size-4" />
              Sign in with a passkey
            </button>
          </>
        ) : null}
      </form>

      <p className="on-photo text-center text-sm text-bar-200">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-brass-300 underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : signupsAllowed ? (
          <>
            First time here?{" "}
            <Link href="/sign-up" className="text-brass-300 underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          "Signups are closed on this instance."
        )}
      </p>
    </div>
  );
}
