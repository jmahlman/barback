"use client";

import { useEffect, useState } from "react";

/**
 * Whether a sign-in made on this page can stick.
 *
 * When BETTER_AUTH_URL is https, the session cookie is a "__Secure-" one, and
 * browsers only keep those on a secure page: HTTPS, or localhost. Opened over
 * plain HTTP at any other address (http://nas:3000), the server accepts the
 * password and sends the cookie, the browser drops it, and the person lands
 * back on the form with nothing to say why. This catches that up front.
 */
export function useSignInBlocked(secureCookies: boolean): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setBlocked(secureCookies && !window.isSecureContext);
  }, [secureCookies]);
  return blocked;
}

export function InsecureSignInNotice({
  publicUrl,
  directAccess,
  context = "sign-in",
}: {
  /** BETTER_AUTH_URL: where signing in does work. */
  publicUrl: string;
  /** Proxy or none mode, where this page is the break-glass route. */
  directAccess: boolean;
  context?: "sign-in" | "setup";
}) {
  const port = typeof window === "undefined" ? "" : window.location.port || "80";
  return (
    <div role="alert" className="card space-y-1.5 border-cherry-400/40 p-3 text-xs text-bar-300">
      <p className="text-sm text-cherry-400">
        {context === "setup"
          ? "You will not stay signed in on this page"
          : "Signing in will not work on this page"}
      </p>
      <p>
        Barback is set up for <span className="font-mono">{publicUrl}</span>, so
        browsers only keep its sign-in on a secure page. This one was opened
        over plain HTTP, so your browser would throw the sign-in away.
        {context === "setup" ? " Your account will still be created." : null}
      </p>
      {directAccess ? (
        <p>
          To sign in directly, open this port as <span className="font-mono">localhost</span>{" "}
          through an SSH tunnel, for example{" "}
          <span className="font-mono">ssh -L {port}:localhost:{port} you@server</span>, then{" "}
          <span className="font-mono">http://localhost:{port}</span>.
        </p>
      ) : (
        <p>
          {context === "setup" ? "Afterwards, sign in at " : "Sign in at "}
          <a href={publicUrl} className="text-brass-300 underline-offset-4 hover:underline">
            {publicUrl}
          </a>{" "}
          instead.
        </p>
      )}
    </div>
  );
}
