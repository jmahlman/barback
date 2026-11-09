"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * A destructive action that asks first, in the page.
 *
 * Deliberately not `window.confirm`. A browser that suppresses dialogs — or a
 * person who ticked "prevent this page from creating additional dialogs" on
 * an earlier one — makes `confirm()` return false forever, and every
 * destructive control in the app silently stops working with no feedback at
 * all. This asks inline, so it always works and is always visible.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Yes, do it",
  question,
  detail,
  onConfirm,
  className = "btn-danger",
  icon,
  disabled = false,
  busyLabel,
}: {
  label: React.ReactNode;
  confirmLabel?: string;
  question: string;
  detail?: string;
  onConfirm: () => Promise<unknown>;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  busyLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus onto the confirmation so it is obvious something was asked,
  // and so a keyboard user is not left behind.
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setAsking(true)}
        className={className}
      >
        {icon}
        {pending ? (busyLabel ?? "Working…") : label}
      </button>
    );
  }

  return (
    <fieldset
      aria-label={question}
      className="space-y-2 rounded-xl border border-cherry-400/40 bg-cherry-400/5 p-3"
    >
      <p className="text-sm text-bar-200">{question}</p>
      {detail ? <p className="text-xs text-bar-400">{detail}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          ref={confirmRef}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onConfirm();
              setAsking(false);
            })
          }
          className="btn-danger"
        >
          {pending ? (busyLabel ?? "Working…") : confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking(false)}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
