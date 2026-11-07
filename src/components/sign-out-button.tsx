"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { LogoutIcon } from "@/components/icons";

/**
 * Only rendered in local mode. Behind a proxy the session belongs to the
 * proxy, and with authentication off there is nothing to sign out of.
 */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
      className="btn-ghost w-full justify-start"
    >
      <LogoutIcon className="size-5" />
      {compact ? "" : busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
