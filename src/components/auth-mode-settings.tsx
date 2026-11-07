"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAuthMode, setSignupsAllowed } from "@/actions/settings";
import type { ActionResult } from "@/actions/inventory";

export interface AuthModeOption {
  value: "local" | "proxy" | "none";
  label: string;
  summary: string;
  /** Spelled out before the change is applied. */
  consequences: string[];
  /** Set when this option cannot currently be chosen. */
  blockedReason?: string;
}

export function AuthModeSettings({
  current,
  options,
  locked,
  lockedBy,
  signupsOpen,
}: {
  current: string;
  options: AuthModeOption[];
  locked: boolean;
  lockedBy: string | null;
  signupsOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState(current);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const selected = options.find((o) => o.value === choice);
  const changed = choice !== current;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl text-bar-200">Authentication</h2>
        <p className="mt-1 text-sm text-bar-400">
          How people get into this instance. Changes apply immediately — no
          restart.
        </p>
      </div>

      {locked ? (
        <div className="card space-y-2 border-brass-400/30 p-4">
          <p className="text-sm text-bar-200">
            Mode is fixed to{" "}
            <strong className="text-brass-300">{lockedBy}</strong> by the{" "}
            <code className="text-bar-300">AUTH_MODE</code> environment
            variable.
          </p>
          <p className="text-xs text-bar-400">
            The environment deliberately wins over this page, because it is the
            one way back in if a mode change ever locks you out. Remove{" "}
            <code className="text-bar-300">AUTH_MODE</code> from your
            environment and restart to manage the mode here instead.
          </p>
        </div>
      ) : (
        <div className="card space-y-4 p-4">
          <div>
            <label className="label" htmlFor="auth-mode">
              Mode
            </label>
            <select
              id="auth-mode"
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setConfirming(false);
                setResult(null);
              }}
              className="field"
            >
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={Boolean(option.blockedReason)}
                >
                  {option.label}
                  {option.blockedReason ? " — unavailable" : ""}
                </option>
              ))}
            </select>
            {selected ? (
              <p className="mt-1.5 text-sm text-bar-400">{selected.summary}</p>
            ) : null}
          </div>

          {selected?.blockedReason ? (
            <p className="text-sm text-cherry-400">{selected.blockedReason}</p>
          ) : null}

          {changed && selected && !selected.blockedReason ? (
            <div className="space-y-2 rounded-xl border border-brass-400/30 bg-brass-400/5 p-3">
              <p className="text-sm font-medium text-brass-300">
                Switching to {selected.label} will:
              </p>
              <ul className="space-y-1 text-sm text-bar-300">
                {selected.consequences.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="text-bar-600">
                      •
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-bar-400">
                If this goes wrong, set{" "}
                <code className="text-bar-300">AUTH_MODE={current}</code> in
                your environment and restart to get back in.
              </p>
            </div>
          ) : null}

          {result ? (
            <p
              role="status"
              className={`text-sm ${result.ok ? "text-citrus-400" : "text-cherry-400"}`}
            >
              {result.error}
            </p>
          ) : null}

          {confirming ? (
            <div className="space-y-2 rounded-xl border border-cherry-400/40 bg-cherry-400/5 p-3">
              <p className="text-sm text-bar-200">
                Switch authentication to{" "}
                <strong className="text-bar-200">{selected?.label}</strong>?
              </p>
              <p className="text-xs text-bar-400">
                This takes effect on the very next request.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!selected) return;
                    startTransition(async () => {
                      const res = await setAuthMode(selected.value);
                      setResult(res);
                      setConfirming(false);
                      if (res.ok) {
                        router.refresh();
                      } else {
                        setChoice(current);
                      }
                    });
                  }}
                  className="btn-danger"
                >
                  {pending ? "Switching…" : "Yes, switch"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !changed || Boolean(selected?.blockedReason)}
                onClick={() => setConfirming(true)}
                className="btn-primary"
              >
                Apply mode
              </button>
              {changed ? (
                <button
                  type="button"
                  onClick={() => {
                    setChoice(current);
                    setResult(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Self-registration. Only meaningful when Barback owns sign-in. */}
      <div className="card space-y-3 p-4">
        <div>
          <p className="font-medium text-bar-200">Account creation</p>
          <p className="mt-1 text-sm text-bar-400">
            {current === "local"
              ? "Whether people can create their own account from the sign-in page."
              : current === "proxy"
                ? "Not used in proxy mode: accounts are created the first time your proxy sends someone through."
                : "Not used when authentication is off: there is only one account."}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-bar-300">
          <input
            type="checkbox"
            checked={signupsOpen}
            disabled={pending || current !== "local"}
            onChange={(e) => {
              const next = e.target.checked;
              startTransition(async () => {
                const res = await setSignupsAllowed(next);
                setResult(res);
                if (res.ok) router.refresh();
              });
            }}
            className="mt-0.5 size-4 accent-brass-400 disabled:opacity-40"
          />
          <span>
            Let anyone create an account
            <span className="mt-0.5 block text-xs text-bar-400">
              Turn this off once you have the accounts you want. The owner can
              still add people from the People page.
            </span>
          </span>
        </label>

        {current === "local" && signupsOpen ? (
          <p className="text-xs text-brass-300">
            Anyone who can reach this instance can register right now.
          </p>
        ) : null}
      </div>
    </section>
  );
}
