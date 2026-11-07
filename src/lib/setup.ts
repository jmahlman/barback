import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * First-run state.
 *
 * A brand new instance has no accounts at all. Rather than dropping someone
 * on a sign-in form they cannot use, Barback sends them to /setup to create
 * the first administrator.
 *
 * That account is deliberately a local one with a password, even when the
 * instance is destined to run behind a reverse proxy: it is the way back in
 * at the instance's own address if the proxy is ever unavailable.
 */
export const isSetupComplete = cache(async (): Promise<boolean> => {
  try {
    return (await db.user.count()) > 0;
  } catch {
    // If the database cannot be read, do not send people into setup and
    // invite them to create a second owner. Fail closed.
    return true;
  }
});
