"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  checkForUpdates,
  dismissUpdateNotice,
  setAutoUpdateCheck,
} from "@/actions/updates";
import { SparkIcon } from "@/components/icons";
import type { ActionResult } from "@/actions/inventory";

export function UpdateControls({
  autoCheck,
  checkedAt,
  current,
  updateTag,
  updateUrl,
  repo,
}: {
  autoCheck: boolean;
  checkedAt: string | null;
  current: string;
  updateTag: string | null;
  updateUrl: string | null;
  repo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <section className="space-y-3">
      {updateTag ? (
        <div className="card space-y-2 border-brass-400/40 bg-brass-400/5 p-4">
          <p className="font-medium text-brass-300">
            {updateTag} is available
          </p>
          <p className="text-sm text-bar-300">
            You are running {current}. Pull the new image and restart to
            update; your database and uploads are on a volume and are not
            touched.
          </p>
          <div className="flex flex-wrap gap-2">
            {updateUrl ? (
              <a
                href={updateUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary"
              >
                Read the release notes
              </a>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await dismissUpdateNotice(updateTag);
                  setResult(res);
                  if (res.ok) router.refresh();
                })
              }
              className="btn-ghost"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-bar-400">
            Dismissing clears the badge until something newer than {updateTag}{" "}
            is released.
          </p>
        </div>
      ) : null}

      <div className="card space-y-3 p-4">
        <div>
          <p className="font-medium text-bar-200">Update checking</p>
          <p className="mt-1 text-sm text-bar-400">
            {repo
              ? `Compares what you are running against releases published on ${repo}.`
              : "No repository is configured, so there is nothing to compare against."}
          </p>
          <p className="mt-1 text-xs text-bar-400">
            {checkedAt
              ? `Last checked ${new Date(checkedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}.`
              : "Never checked."}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-bar-300">
          <input
            type="checkbox"
            checked={autoCheck}
            disabled={pending || !repo}
            onChange={(e) => {
              const next = e.target.checked;
              startTransition(async () => {
                const res = await setAutoUpdateCheck(next);
                setResult(res);
                if (res.ok) router.refresh();
              });
            }}
            className="mt-0.5 size-4 accent-brass-400 disabled:opacity-40"
          />
          <span>
            Check once a day automatically
            <span className="mt-0.5 block text-xs text-bar-400">
              Off by default. This is the only request Barback makes without
              being asked, and it goes to GitHub&apos;s public releases API
              — no telemetry, nothing about this instance is sent.
            </span>
          </span>
        </label>

        <button
          type="button"
          disabled={pending || !repo}
          onClick={() =>
            startTransition(async () => {
              const res = await checkForUpdates();
              setResult(res);
              if (res.ok) router.refresh();
            })
          }
          className="btn-primary"
        >
          <SparkIcon className="size-5" />
          {pending ? "Asking GitHub…" : "Check now"}
        </button>

        {result ? (
          <p
            role="status"
            className={`text-sm ${result.ok ? "text-citrus-400" : "text-cherry-400"}`}
          >
            {result.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
