"use client";

/**
 * A moment shown in the reader's own time zone and format.
 *
 * Formatted in the browser, not on the server: a container usually runs in
 * UTC, so a server-formatted time would be hours out for most people. The
 * server's first render can differ from the browser's, which is expected
 * here and not worth a warning.
 */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
