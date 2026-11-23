"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ConfirmButton } from "@/components/confirm-button";
import { KeyIcon, PlusIcon, TrashIcon } from "@/components/icons";

/**
 * The signed-in person's passkeys: sign-in with Face ID, Touch ID, Windows
 * Hello or a security key.
 *
 * Only ever an extra way in. The password stays, because it is what an
 * administrator falls back on, and because passkeys stop working if the
 * instance moves to a different address.
 */

export interface PasskeyView {
  id: string;
  name: string | null;
  createdAt: string | null;
  /** Synced between devices, e.g. through iCloud Keychain or Google Password Manager. */
  synced: boolean;
}

function describeAddError(error: { code?: string; message?: string }): string | null {
  switch (error.code) {
    // Closing the browser's prompt is a choice, not a failure.
    case "ERROR_CEREMONY_ABORTED":
    case "REGISTRATION_CANCELLED":
      return null;
    case "SESSION_NOT_FRESH":
      return "For your security, adding a passkey needs a recent sign-in. Sign out, sign in again, and add it straight away.";
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
    case "PREVIOUSLY_REGISTERED":
      return "This device already has a passkey for your account.";
    default:
      return error.message || "The passkey could not be added. Try again.";
  }
}

export function PasskeySettings({
  passkeys,
  domain,
}: {
  passkeys: PasskeyView[];
  /** The address passkeys are bound to. */
  domain: string;
}) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Why passkeys cannot be added from this page, if they cannot.
  const [blocked, setBlocked] = useState<"insecure" | "address" | null>(null);

  useEffect(() => {
    if (!window.isSecureContext || typeof window.PublicKeyCredential === "undefined") {
      setBlocked("insecure");
      setSupported(false);
    } else if (window.location.hostname !== domain) {
      // The browser would refuse: a passkey only works on its own domain.
      setBlocked("address");
      setSupported(false);
    } else {
      setSupported(true);
    }
  }, [domain]);

  async function add() {
    setError(null);
    setAdding(true);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setAdding(false);
    if (result?.error) {
      setError(
        describeAddError({
          code: "code" in result.error ? result.error.code : undefined,
          message: result.error.message,
        }),
      );
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <div id="passkeys" className="scroll-mt-6 space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm text-bar-200">
          <KeyIcon className="size-4 text-brass-400" />
          Passkeys
        </h3>
        <p className="text-xs text-bar-400">
          Sign in with Face ID, Touch ID, Windows Hello or a security key instead
          of typing your password. Your password still works.
        </p>
      </div>

      {passkeys.length > 0 ? (
        <ul className="card divide-y divide-bar-800 overflow-hidden">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-bar-200">{passkey.name || "Unnamed passkey"}</p>
                <p className="text-xs text-bar-400">
                  {passkey.createdAt
                    ? `Added ${new Date(passkey.createdAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}`
                    : "Added earlier"}
                  {passkey.synced ? " · synced between your devices" : " · this device only"}
                </p>
              </div>
              <ConfirmButton
                label="Remove"
                icon={<TrashIcon className="size-4" />}
                question={`Remove ${passkey.name || "this passkey"}?`}
                detail="You will no longer be able to sign in with it. Your password is not affected."
                confirmLabel="Remove it"
                busyLabel="Removing…"
                className="btn-danger shrink-0"
                onConfirm={async () => {
                  await authClient.passkey.deletePasskey({ id: passkey.id });
                  router.refresh();
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {blocked === "insecure" ? (
        <p className="text-xs text-bar-400">
          Passkeys need a secure connection. This page was loaded over plain
          HTTP, so the browser will not offer them. Serve Barback over HTTPS,
          for example behind your reverse proxy, to add one.
        </p>
      ) : blocked === "address" ? (
        <p className="text-xs text-bar-400">
          Passkeys for this Barback belong to {domain}, but this page was
          opened at a different address. Open it at {domain} to add one.
        </p>
      ) : supported ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="passkey-name">
              Name it <span className="text-xs font-normal text-bar-500">— optional</span>
            </label>
            <input
              id="passkey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="field"
              placeholder="My iPhone"
            />
          </div>
          <button type="button" onClick={add} disabled={adding} className="btn-secondary">
            <PlusIcon className="size-4" />
            {adding ? "Waiting for your device…" : "Add a passkey"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-cherry-400">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-bar-500">
        Passkeys are tied to {domain}. If this Barback moves to a different
        address, they stop working there; sign in with your password and add new
        ones.
      </p>
    </div>
  );
}
