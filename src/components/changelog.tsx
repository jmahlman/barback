"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sheet } from "@/components/sheet";
import { BookIcon } from "@/components/icons";

export interface ReleaseView {
  tag: string;
  name: string;
  body: string;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  isCurrent: boolean;
  isLatest: boolean;
}

function relativeDay(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/**
 * Release notes are Markdown written by whoever cut the release. They are
 * rendered through react-markdown, which produces React elements rather
 * than raw HTML, so nothing in a release body can inject markup.
 */
export function ReleaseList({ releases }: { releases: ReleaseView[] }) {
  const [open, setOpen] = useState<ReleaseView | null>(null);

  return (
    <>
      <ul className="space-y-2">
        {releases.map((release) => (
          <li
            key={release.tag}
            className="card flex flex-wrap items-center justify-between gap-3 p-3"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs text-bar-400">
                {relativeDay(release.publishedAt)}
              </span>
              <span className="font-display text-lg text-bar-200">{release.name}</span>
              {release.isLatest ? (
                <span className="chip border-citrus-400/40 text-citrus-400">Latest</span>
              ) : null}
              {release.isCurrent ? (
                <span className="chip border-brass-400/40 text-brass-300">Current</span>
              ) : null}
              {release.prerelease ? <span className="chip">Pre-release</span> : null}
            </span>

            <button
              type="button"
              onClick={() => setOpen(release)}
              className="btn-secondary shrink-0 text-sm"
            >
              <BookIcon className="size-4" />
              View changelog
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `${open.name} changelog` : "Changelog"}
      >
        {open ? (
          <div className="space-y-4">
            {open.publishedAt ? (
              <p className="text-xs text-bar-400">
                Released{" "}
                {new Date(open.publishedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            ) : null}

            {open.body ? (
              <div className="changelog">
                <Markdown remarkPlugins={[remarkGfm]}>{open.body}</Markdown>
              </div>
            ) : (
              <p className="text-sm text-bar-400">
                This release has no notes.
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-bar-800 pt-4">
              <button type="button" onClick={() => setOpen(null)} className="btn-secondary">
                Close
              </button>
              <a
                href={open.url}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-primary"
              >
                View on GitHub
              </a>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
