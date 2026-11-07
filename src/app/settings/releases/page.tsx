import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ReleaseList, type ReleaseView } from "@/components/changelog";
import { UpdateControls } from "@/components/update-controls";
import { SparkIcon } from "@/components/icons";
import { isOwner } from "@/lib/owner";
import { compareVersions, getReleaseState } from "@/lib/releases";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Releases" };

export default async function ReleasesPage() {
  const user = await requireUser();
  const owner = await isOwner(user.id);

  // Cache only. Opening this page never reaches GitHub.
  const state = await getReleaseState();

  const latest = state.releases.find((r) => !r.prerelease);

  const releases: ReleaseView[] = state.releases.map((release) => ({
    tag: release.tag,
    name: release.name,
    body: release.body,
    publishedAt: release.publishedAt,
    url: release.url,
    prerelease: release.prerelease,
    isCurrent: compareVersions(release.tag, state.current) === 0,
    isLatest: latest?.tag === release.tag,
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Releases"
        subtitle={`You are running ${state.current}.`}
      />
      <PageBody>
        {owner ? (
          <UpdateControls
            autoCheck={state.autoCheck}
            checkedAt={state.checkedAt}
            current={state.current}
            updateTag={state.updateAvailable?.tag ?? null}
            updateUrl={state.updateAvailable?.url ?? null}
            repo={state.repo}
          />
        ) : null}

        {releases.length === 0 ? (
          <EmptyState
            icon={<SparkIcon className="size-12" />}
            title="No releases saved yet"
            body={
              state.repo
                ? `Barback has not asked GitHub about ${state.repo} yet. Nothing is requested until you press the button.`
                : "No GitHub repository is configured, so there is nothing to check against."
            }
            action={
              owner ? undefined : (
                <Link href="/settings" className="btn-secondary">
                  Back to settings
                </Link>
              )
            }
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-bar-400">
              {releases.length} release{releases.length === 1 ? "" : "s"}
            </h2>
            <ReleaseList releases={releases} />
          </section>
        )}

        {state.repoUrl ? (
          <p className="border-t border-bar-800 pt-4 text-xs text-bar-400">
            Source and releases:{" "}
            <a
              href={state.repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brass-300 underline-offset-4 hover:underline"
            >
              {state.repo}
            </a>
          </p>
        ) : null}
      </PageBody>
    </AppShell>
  );
}
