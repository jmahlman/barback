"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { signInWithIdentifier } from "@/actions/sign-in";
import { PasswordField } from "@/components/password-field";

export function AuthForm({
  mode,
  signupsAllowed,
}: {
  mode: "sign-in" | "sign-up";
  signupsAllowed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "sign-up";

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
            autoComplete="username"
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
