import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { BREAK_GLASS_ENABLED, isLocalAuth } from "@/lib/auth-mode";

/**
 * Barback's own sign-in endpoints.
 *
 * Open in local mode. In proxy and none mode they stay reachable only so an
 * instance admin can get in directly when the proxy is not available — see
 * BREAK_GLASS_ENABLED. The session that results is still refused for anyone
 * who is not an admin, in src/lib/session.ts.
 */
const handler = toNextJsHandler(auth);

const disabled = () =>
  NextResponse.json(
    { message: "Password sign-in is disabled on this instance." },
    { status: 404 },
  );

async function allowed(): Promise<boolean> {
  return (await isLocalAuth()) || BREAK_GLASS_ENABLED;
}

export async function GET(request: Request) {
  if (!(await allowed())) return disabled();
  return handler.GET(request);
}

export async function POST(request: Request) {
  if (!(await allowed())) return disabled();
  return handler.POST(request);
}
