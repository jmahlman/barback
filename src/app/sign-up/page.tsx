import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthBackdrop } from "@/components/auth-backdrop";
import { signupsAllowed } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/setup";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (!(await isSetupComplete())) redirect("/setup");

  const session = await getSession();
  if (session?.user) redirect("/");

  if (!(await signupsAllowed())) {
    return (
      <AuthBackdrop>
      <div className="on-photo flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-logo text-3xl text-brass-300 sm:text-4xl">Barback</p>
        <p className="max-w-sm text-sm text-bar-200">
          Signups are closed on this instance. Ask the owner for an account, or set{" "}
          <code className="text-bar-300">ALLOW_SIGNUPS=true</code> to reopen them.
        </p>
        <Link href="/sign-in" className="btn-secondary">
          Back to sign in
        </Link>
      </div>
      </AuthBackdrop>
    );
  }

  return (
    <AuthBackdrop>
      <AuthForm
        mode="sign-up"
        signupsAllowed
      />
    </AuthBackdrop>
  );
}
