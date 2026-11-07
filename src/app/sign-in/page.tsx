import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthBackdrop } from "@/components/auth-backdrop";
import { signupsAllowed } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/setup";
import { BREAK_GLASS_ENABLED, getAuthMode } from "@/lib/auth-mode";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (!(await isSetupComplete())) redirect("/setup");

  const session = await getSession();
  if (session?.user) redirect("/");

  // In proxy mode a signed-out visitor means the proxy did not pass an
  // identity; there is no password form that could help them.
  const mode = await getAuthMode();

  // Outside local mode the form is only shown when break-glass could
  // actually work: an admin exists and has a password to use.
  const breakGlassArmed =
    mode !== "local" &&
    BREAK_GLASS_ENABLED &&
    (await db.user.count({
      where: { role: "admin", accounts: { some: { providerId: "credential" } } },
    })) > 0;

  if (mode !== "local" && !breakGlassArmed) {
    return (
      <AuthBackdrop>
      <div className="on-photo flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-logo text-4xl text-brass-300 sm:text-5xl">Barback</p>
        {mode === "proxy" ? (
          <>
            <p className="max-w-sm text-sm text-bar-200">
              This instance is behind a reverse proxy, and the proxy did not
              pass an identity for you. Sign in through it and come back.
            </p>
            <p className="max-w-sm text-xs text-bar-300">
              If you are the owner and did not expect this, check that your
              proxy forwards the identity headers, and that its shared secret
              matches the one Barback is configured with.
            </p>
          </>
        ) : (
          <p className="max-w-sm text-sm text-bar-200">
            Authentication is switched off on this instance, so there is
            nothing to sign in to. Something is misconfigured — check the
            server logs.
          </p>
        )}
      </div>
      </AuthBackdrop>
    );
  }

  // A non-admin can still obtain a password session, but it is refused on
  // every page. Without this they would bounce between "signed in" and this
  // form with nothing explaining why.
  let refusedNonAdmin = false;
  if (mode !== "local") {
    const raw = await auth.api.getSession({ headers: await headers() });
    const role = (raw?.user as { role?: string | null } | undefined)?.role;
    refusedNonAdmin = Boolean(raw?.user) && role !== "admin";
  }

  if (refusedNonAdmin) {
    return (
      <AuthBackdrop>
        <div className="on-photo flex flex-col items-center justify-center gap-4 text-center">
          <p className="font-logo text-4xl text-brass-300 sm:text-5xl">Barback</p>
          <p className="max-w-sm text-sm text-bar-300">
            Your password is correct, but this instance signs people in
            through its reverse proxy. Only administrators may sign in
            directly.
          </p>
          <p className="max-w-sm text-xs text-bar-400">
            Go through your usual address and your proxy will let you in.
          </p>
        </div>
      </AuthBackdrop>
    );
  }

  return (
    <AuthBackdrop>
      <div className="mx-auto w-full max-w-sm space-y-4">
        {breakGlassArmed ? (
          <div className="card border-brass-400/30 p-3 text-center">
            <p className="text-sm text-brass-300">Administrator access</p>
            <p className="mt-1 text-xs text-bar-400">
              This instance normally signs people in through its reverse
              proxy. This form is here so an administrator can still get in
              directly — for example if the proxy is down.
            </p>
          </div>
        ) : null}
        <AuthForm
          mode="sign-in"
          signupsAllowed={mode === "local" && (await signupsAllowed())}
        />
      </div>
    </AuthBackdrop>
  );
}
