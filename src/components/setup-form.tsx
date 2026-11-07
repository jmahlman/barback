"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeSetup } from "@/actions/setup";
import type { ActionResult } from "@/actions/inventory";

export function SetupForm({ authMode }: { authMode: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const fieldError = (name: string) => result?.fieldErrors?.[name];

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await completeSetup(formData);
          setResult(res);
          if (res.ok) {
            router.replace("/");
            router.refresh();
          }
        });
      }}
      className="card space-y-4 p-5 shadow-xl shadow-black/40"
    >
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          className="field"
          placeholder="John"
        />
        {fieldError("name") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("name")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="field"
          placeholder="john"
        />
        <p className="mt-1 text-xs text-bar-400">
          What you sign in with. Use the same handle your reverse proxy
          reports — Authelia and Authentik send a username, not an email, and
          matching it keeps you as one account either way.
        </p>
        {fieldError("username") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("username")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email <span className="font-normal text-bar-400">(optional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
          className="field"
          placeholder="you@example.com"
        />
        <p className="mt-1 text-xs text-bar-400">
          You can sign in with this too. Leave it blank if you would rather
          not — Barback sends no mail and nothing here needs it.
        </p>
        {fieldError("email") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("email")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
          placeholder="At least 8 characters"
        />
        {fieldError("password") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("password")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
          placeholder="Type it again"
        />
        {fieldError("confirm") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("confirm")}</p>
        ) : null}
      </div>

      {result && !result.ok && !result.fieldErrors ? (
        <p role="alert" className="text-sm text-cherry-400">
          {result.error}
        </p>
      ) : null}

      <label className="flex items-start gap-2 border-t border-bar-800 pt-4 text-sm text-bar-300">
        <input
          type="checkbox"
          name="checkUpdates"
          className="mt-0.5 size-4 accent-brass-400"
        />
        <span>
          Check for updates automatically
          <span className="mt-0.5 block text-xs text-bar-400">
            Asks GitHub once a day whether a newer version has been released.
            This is the only request Barback makes without being asked, and it
            sends nothing about this instance. You can change it later in
            Settings.
          </span>
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Setting up…" : "Create my account"}
      </button>
    </form>
  );
}
